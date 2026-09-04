"use client";

import { create } from "zustand";
import { api } from "@/lib/api";
import {
  getSupabaseBrowserClient,
  isSupabaseConfigured,
  setCurrentSupabaseAccessToken,
} from "@/lib/supabase";
import { fetchOwnProfile, mapSupabaseProfileToDTO } from "@/services/profiles";
import type { Session } from "@supabase/supabase-js";
import type { SessionUser } from "@/types";

/**
 * Centralized auth state for KIVO, driven by Supabase Auth.
 *
 * Lifecycle handled here (and only here):
 *   - initial session loading  → status stays "loading" until resolved
 *   - login / signup           → SIGNED_IN event + explicit refresh
 *   - logout                   → SIGNED_OUT event + cookie cleanup
 *   - page refresh             → getSession() restores from localStorage
 *   - session restoration      → bridge re-establishes the app cookie
 *   - session expiration       → token refresh failure → SIGNED_OUT
 *
 * Protected content is never rendered before the initial auth state has
 * been resolved (the router gate shows the splash while status === "loading").
 *
 * Legacy note: accounts that exist only in the app's own database (the demo
 * account) keep working through the cookie session fallback.
 */

interface SessionState {
  user: SessionUser | null;
  status: "loading" | "authenticated" | "unauthenticated";
  /** The verified Supabase Auth user id for the signed-in identity (null for legacy local accounts). */
  authId: string | null;
  setUser: (user: SessionUser | null) => void;
  refresh: () => Promise<SessionUser | null>;
  signOut: () => Promise<void>;
}

// ─── module-level dedupe guards (avoid duplicate requests) ───────────────────

let authListenerStarted = false;
let lastHydratedAuthId: string | null = null;
let hydrateInFlight: { id: string; promise: Promise<SessionUser> } | null = null;
let bridgeToken: string | null = null;
let bridgePromise: Promise<SessionUser> | null = null;

/** One bridge call per access token — refreshes the app cookie + mirror. */
function bridgeSession(accessToken: string): Promise<SessionUser> {
  if (bridgeToken === accessToken && bridgePromise) return bridgePromise;
  bridgeToken = accessToken;
  bridgePromise = api<SessionUser>("/api/auth/bridge", { body: { accessToken } }).catch(
    (err) => {
      bridgeToken = null;
      bridgePromise = null;
      throw err;
    }
  );
  return bridgePromise;
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Resolve the signed-in identity: bridge to the app backend, then overlay
 * the REAL Supabase profile row (profiles table) on top of the mirror DTO.
 * Retries once moments after signup in case the profile trigger is still
 * committing; falls back to the mirror profile if Supabase is unreachable.
 */
async function hydrateFromSupabase(session: Session): Promise<SessionUser> {
  const authId = session.user.id;

  if (hydrateInFlight?.id === authId) return hydrateInFlight.promise;
  if (lastHydratedAuthId === authId && useSession.getState().user) {
    return useSession.getState().user as SessionUser;
  }

  const promise = (async () => {
    let dto = await bridgeSession(session.access_token);

    try {
      let row = await fetchOwnProfile(authId);
      if (!row) {
        // Profile trigger may still be running right after signup.
        await wait(900);
        row = await fetchOwnProfile(authId);
      }
      if (row) {
        dto = { ...dto, profile: mapSupabaseProfileToDTO(row, dto.profile) };
      }
    } catch (err) {
      // Non-fatal: the mirror profile keeps the UI functional.
      console.warn("[kivo-auth] Supabase profile unavailable, using app profile.", err);
    }

    lastHydratedAuthId = authId;
    useSession.setState({ user: dto, status: "authenticated", authId });
    return dto;
  })()
    .catch((err) => {
      lastHydratedAuthId = null;
      throw err;
    })
    .finally(() => {
      if (hydrateInFlight?.promise === promise) hydrateInFlight = null;
    });

  hydrateInFlight = { id: authId, promise };
  return promise;
}

/** Idempotently subscribe to Supabase auth state changes. */
function startAuthListener() {
  if (authListenerStarted || typeof window === "undefined" || !isSupabaseConfigured()) return;
  authListenerStarted = true;

  getSupabaseBrowserClient().auth.onAuthStateChange((event, session) => {
    const store = useSession.getState();

    if (event === "SIGNED_OUT") {
      lastHydratedAuthId = null;
      bridgeToken = null;
      bridgePromise = null;
      setCurrentSupabaseAccessToken(null);
      useSession.setState({ authId: null });
      store.setUser(null);
      return;
    }

    if (!session?.user) return;

    // Keep the in-memory token cache fresh for the API client / uploads.
    setCurrentSupabaseAccessToken(session.access_token);

    if (event === "SIGNED_IN" || event === "USER_UPDATED" || event === "INITIAL_SESSION") {
      void hydrateFromSupabase(session).catch((err) => {
        console.warn("[kivo-auth] session hydration failed.", err);
      });
    } else if (event === "TOKEN_REFRESHED") {
      // Keep the app cookie warm without refetching the profile.
      void bridgeSession(session.access_token).catch(() => {
        /* transient — the next full refresh will retry */
      });
    }
  });
}

// ─── store ───────────────────────────────────────────────────────────────────

export const useSession = create<SessionState>((set) => ({
  user: null,
  status: "loading",
  authId: null,

  setUser: (user) =>
    set({ user, status: user ? "authenticated" : "unauthenticated" }),

  refresh: async () => {
    if (typeof window === "undefined") return null;
    try {
      if (isSupabaseConfigured()) {
        const supabase = getSupabaseBrowserClient();
        startAuthListener();

        const { data } = await supabase.auth.getSession();
        const session = data.session;
        if (session?.user) {
          setCurrentSupabaseAccessToken(session.access_token);
          try {
            const hydrated = await hydrateFromSupabase(session);
            return hydrated;
          } catch (err) {
            console.warn("[kivo-auth] Supabase session bridge failed; trying app cookie.", err);
          }
        }
      }

      // Legacy fallback — the demo account / bridge outage path.
      const legacy = await api<SessionUser | null>("/api/auth/session");
      if (legacy) {
        set({ user: legacy, status: "authenticated" });
      } else {
        set({ user: null, status: "unauthenticated", authId: null });
      }
      return legacy;
    } catch {
      set({ user: null, status: "unauthenticated" });
      return null;
    }
  },

  signOut: async () => {
    try {
      await api("/api/auth/logout", { method: "POST" });
    } catch {
      /* cookie cleanup is best-effort */
    }
    try {
      if (isSupabaseConfigured()) await getSupabaseBrowserClient().auth.signOut();
    } catch {
      /* local signout is best-effort */
    }
    lastHydratedAuthId = null;
    bridgeToken = null;
    bridgePromise = null;
    setCurrentSupabaseAccessToken(null);
    set({ user: null, status: "unauthenticated", authId: null });
  },
}));
