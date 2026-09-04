"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Lightweight hash router for the single-page KIVO app.
 * Routes look like: #/ , #/login , #/profile/:username , #/saved/:collectionId ...
 *
 * Next.js <Link href="#/..."> performs history.pushState (no `hashchange` event),
 * so the router also listens to a synthetic "kivo:route" event emitted from a
 * one-time pushState/replaceState patch below.
 *
 * IMPORTANT: the synthetic event is dispatched from a macrotask, never
 * synchronously. Next.js App Router applies its own history updates inside
 * `useInsertionEffect` (its HistoryUpdater); if we dispatched synchronously,
 * `setHash` would schedule a React update during that commit phase and React
 * would throw "useInsertionEffect must not schedule updates". A macrotask
 * (setTimeout 0) always runs after React's synchronous commit work finishes.
 */

let historyPatched = false;

function patchHistory() {
  if (historyPatched || typeof window === "undefined") return;
  historyPatched = true;
  const wrap = (name: "pushState" | "replaceState") => {
    const original = window.history[name].bind(window.history);
    window.history[name] = (...args: Parameters<History["pushState"]>) => {
      const result = original(...args);
      notifyRouteChangedAsync();
      return result;
    };
  };
  wrap("pushState");
  wrap("replaceState");
}

let notifyPending = false;

/** Coalesced macrotask dispatch — safe to call from inside React commit work. */
function notifyRouteChangedAsync() {
  if (notifyPending) return;
  notifyPending = true;
  window.setTimeout(() => {
    notifyPending = false;
    window.dispatchEvent(new Event("kivo:route"));
  }, 0);
}

patchHistory();

export function useHashRoute() {
  const [hash, setHash] = useState<string>(() =>
    typeof window !== "undefined" ? normalize(window.location.hash) : "/",
  );

  useEffect(() => {
    const onChange = () => {
      const next = normalize(window.location.hash);
      setHash((prev) => (prev === next ? prev : next));
    };
    onChange(); // sync on mount (client value may differ from SSR)
    window.addEventListener("hashchange", onChange);
    window.addEventListener("popstate", onChange);
    window.addEventListener("kivo:route", onChange);
    return () => {
      window.removeEventListener("hashchange", onChange);
      window.removeEventListener("popstate", onChange);
      window.removeEventListener("kivo:route", onChange);
    };
  }, []);

  const navigate = useCallback((to: string, opts?: { replace?: boolean }) => {
    const target = `#${normalize(to)}`;
    if (window.location.hash === target) {
      setHash(normalize(to)); // re-render same-route navigations
      return;
    }
    if (opts?.replace) {
      window.history.replaceState(null, "", target);
      setHash(normalize(to));
    } else {
      window.location.hash = target;
    }
  }, []);

  const back = useCallback(() => window.history.back(), []);
  // (replaceState above is wrapped by patchHistory → event is deferred, and the
  //  synchronous setHash gives an instant update; the deferred event is a no-op
  //  thanks to the prev/next equality check in the listener.)

  return { path: hash, navigate, back };
}

function normalize(hash: string): string {
  let p = hash.replace(/^#/, "");
  if (!p.startsWith("/")) p = "/" + p;
  if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1);
  return p || "/";
}

/** Programmatic navigation usable outside React (event handlers, stores). */
export function navigateTo(to: string, opts?: { replace?: boolean }) {
  const target = `#${normalize(to)}`;
  if (window.location.hash === target) {
    setHashGlobal(normalize(to));
    return;
  }
  if (opts?.replace) {
    window.history.replaceState(null, "", target);
    setHashGlobal(normalize(to));
  } else {
    window.location.hash = target;
  }
}

// The router state lives inside the hook; for out-of-tree navigateTo calls we
// rely on the event listeners picking up the change. For same-route navigations
// we dispatch the synthetic event so listeners re-sync.
function setHashGlobal(normalized: string) {
  notifyRouteChangedAsync();
  void normalized;
}

export interface RouteMatch {
  name: string;
  params: Record<string, string>;
}

/** Matches a path like /profile/:username against registered patterns. */
export function matchRoute(path: string): RouteMatch {
  const segments = path.split("/").filter(Boolean);
  const s0 = segments[0] ?? "";

  if (segments.length === 0) return { name: "home", params: {} };
  switch (s0) {
    case "login":
      return { name: "login", params: {} };
    case "signup":
      return { name: "signup", params: {} };
    case "verify-email":
      return { name: "verify-email", params: {} };
    case "forgot-password":
      return { name: "forgot-password", params: {} };
    case "reset-password":
      return { name: "reset-password", params: { token: segments[1] ?? "" } };
    case "explore":
      return { name: "explore", params: {} };
    case "notifications":
      return { name: "notifications", params: {} };
    case "saved":
      return segments[1]
        ? { name: "saved-collection", params: { collectionId: segments[1] } }
        : { name: "saved", params: {} };
    case "spaces":
      return segments[1]
        ? { name: "space-detail", params: { slug: segments[1] } }
        : { name: "spaces", params: {} };
    case "hashtag":
      return { name: "hashtag", params: { tag: decodeURIComponent(segments[1] ?? "") } };
    case "profile":
      return { name: "profile", params: { username: decodeURIComponent(segments[1] ?? "") } };
    case "settings":
      return { name: "settings", params: {} };
    default:
      return { name: "not-found", params: {} };
  }
}
