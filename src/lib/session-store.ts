"use client";

import { create } from "zustand";
import { api, ApiError } from "@/lib/api";
import {
  getSupabaseBrowserClient,
  isSupabaseConfigured,
  setCurrentSupabaseAccessToken,
} from "@/lib/supabase";
import { fetchOwnProfile, mapSupabaseProfileToDTO, type SupabaseProfileRow } from "@/services/profiles";
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
 * ARCHITECTURE RULE: Supabase Auth is the single source of truth for
 * identity. A valid Supabase session is NEVER collapsed into
 * "unauthenticated" — when the app bridge (mirror session for the legacy API
 * layer) is unreachable, the user stays authenticated with a Supabase-only
 * identity and `bridgeDegraded: true`; the bridge is retried automatically
 * (refresh + every token refresh) instead of logging the user out.
 *
 * Email-verification flow: beginEmailVerification()/finishEmailVerification()
 * hand hydration control to the OTP screen so the SIGNED_IN event emitted by
 * verifyOtp() never races the explicit, awaited bridge sequence.
 *
 * Legacy note: accounts that exist only in the app's own database (the demo
 * account) keep working through the cookie session fallback.
 */

interface SessionState {
  user: SessionUser | null;
  status: "loading" | "authenticated" | "unauthenticated";
  /** The verified Supabase Auth user id for the signed-in identity (null for legacy local accounts). */
  authId: string | null;
  /** True when the Supabase session is valid but the app bridge is unreachable. */
  bridgeDegraded: boolean;
  setUser: (user: SessionUser | null) => void;
  refresh: () => Promise<SessionUser | null>;
  signOut: () => Promise<void>;
  /** OTP screen: take over hydration while verifyOtp()/bridge run (suppresses the auth listener). */
  beginEmailVerification: () => void;
  endEmailVerification: () => void;
  /**
   * Awaited bridge + hydration after a successful OTP verification.
   * Returns ok:false (with a friendly message) instead of throwing so the
   * OTP screen can keep the valid Supabase session and offer a retry —
   * the user is never redirected to login on a bridge failure.
   */
  finishEmailVerification: (
    accessToken: string
  ) => Promise<{ ok: true } | { ok: false; message: string }>;
}

// ─── module-level dedupe guards (avoid duplicate requests) ───────────────────

let authListenerStarted = false;
let lastHydratedAuthId: string | null = null;
let hydrateInFlight: { id: string; promise: Promise<SessionUser> } | null = null;
let bridgeToken: string | null = null;
let bridgePromise: Promise<SessionUser> | null = null;
/** True while the OTP screen owns hydration (suppresses listener + refresh races). */
let verificationFlowActive = false;

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
 * committing.
 *
 * `requireBridge` (OTP completion): the bridge MUST succeed — a failure is
 * thrown so the caller can offer a retry without redirecting anywhere.
 *
 * Default: when the bridge is unreachable, the user STAYS authenticated with
 * a Supabase-only identity (`bridgeDegraded`) instead of being logged out —
 * the Supabase session is the source of truth and is synchronized later.
 */
async function hydrateFromSupabase(
  session: Session,
  opts: { requireBridge?: boolean; force?: boolean } = {}
): Promise<SessionUser> {
  const authId = session.user.id;

  if (!opts.force && !opts.requireBridge) {
    if (hydrateInFlight?.id === authId) return hydrateInFlight.promise;
    if (lastHydratedAuthId === authId && useSession.getState().user) {
      return useSession.getState().user as SessionUser;
    }
  }

  const promise = (async () => {
    let dto: SessionUser | null = null;
    let degraded = false;

    try {
      dto = await bridgeSession(session.access_token);
    } catch (err) {
      if (opts.requireBridge) throw err;
      degraded = true;
      console.warn(
        "[kivo-auth] App bridge unreachable — keeping the Supabase session (degraded mode).",
        err
      );
    }

    // Profile overlay — reads Supabase directly from the browser (RLS-guarded),
    // so it works even when the app bridge is down.
    let row: SupabaseProfileRow | null = null;
    try {
      row = await fetchOwnProfile(authId);
      if (!row) {
        // Profile trigger may still be running right after signup.
        await wait(900);
        row = await fetchOwnProfile(authId);
      }
      if (row && dto) {
        dto = { ...dto, profile: mapSupabaseProfileToDTO(row, dto.profile) };
      }
    } catch (err) {
      // Non-fatal when the bridge already gave us a mirror profile.
      console.warn("[kivo-auth] Supabase profile unavailable, using app profile.", err);
    }

    if (!dto) {
      // Bridge down — build the identity from the Supabase profile row alone
      // rather than discarding a valid Supabase session.
      if (!row) {
        throw new Error("No profile is available for this account yet. Please try again.");
      }
      dto = {
        id: authId,
        email: session.user.email ?? "",
        createdAt:
          (session.user as { created_at?: string }).created_at ?? new Date().toISOString(),
        profile: mapSupabaseProfileToDTO(row),
      };
    }

    lastHydratedAuthId = authId;
    setCurrentSupabaseAccessToken(session.access_token);
    useSession.setState({
      user: dto,
      status: "authenticated",
      authId,
      bridgeDegraded: degraded,
    });
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
    if (process.env.NODE_ENV !== "production") {
      // Safe diagnostics only — event name + boolean, never tokens.
      console.info("[kivo-auth:dev] auth event:", event, {
        hasSession: Boolean(session?.user),
      });
    }

    const store = useSession.getState();

    if (event === "SIGNED_OUT") {
      lastHydratedAuthId = null;
      bridgeToken = null;
      bridgePromise = null;
      setCurrentSupabaseAccessToken(null);
      useSession.setState({ authId: null, bridgeDegraded: false });
      store.setUser(null);
      return;
    }

    // The email-verification flow owns hydration while it runs — a SIGNED_IN
    // emitted by verifyOtp() must not race the awaited bridge sequence.
    if (verificationFlowActive) return;

    if (!session?.user) return;

    // Keep the in-memory token cache fresh for the API client / uploads.
    setCurrentSupabaseAccessToken(session.access_token);

    if (event === "SIGNED_IN" || event === "USER_UPDATED" || event === "INITIAL_SESSION") {
      void hydrateFromSupabase(session).catch((err) => {
        console.warn("[kivo-auth] session hydration failed.", err);
      });
    } else if (event === "TOKEN_REFRESHED") {
      // Keep the app cookie warm without refetching the profile — and when
      // the bridge recovers after a degraded session, upgrade to fully synced.
      void bridgeSession(session.access_token)
        .then(() => {
          if (useSession.getState().bridgeDegraded) {
            void hydrateFromSupabase(session, { force: true });
          }
        })
        .catch(() => {
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
  bridgeDegraded: false,

  setUser: (user) =>
    set({ user, status: user ? "authenticated" : "unauthenticated" }),

  refresh: async () => {
    if (typeof window === "undefined") return null;
    // The OTP completion flow owns hydration while it runs — don't race it.
    if (verificationFlowActive) return useSession.getState().user;
    try {
      if (isSupabaseConfigured()) {
        const supabase = getSupabaseBrowserClient();
        startAuthListener();

        const { data } = await supabase.auth.getSession();
        const session = data.session;
        if (session?.user) {
          try {
            return await hydrateFromSupabase(session);
          } catch (err) {
            console.warn(
              "[kivo-auth] Supabase session hydration failed; trying the app cookie session.",
              err
            );
            // Full hydration impossible (bridge AND profile unavailable) —
            // last resort: the legacy cookie session.
            const legacy = await api<SessionUser | null>("/api/auth/session");
            if (legacy) {
              set({ user: legacy, status: "authenticated", bridgeDegraded: false });
              return legacy;
            }
            set({ user: null, status: "unauthenticated", authId: null, bridgeDegraded: false });
            return null;
          }
        }

        // No Supabase session — the demo / legacy cookie account.
        const legacy = await api<SessionUser | null>("/api/auth/session");
        if (legacy) {
          set({ user: legacy, status: "authenticated", bridgeDegraded: false });
          return legacy;
        }
        set({ user: null, status: "unauthenticated", authId: null, bridgeDegraded: false });
        return null;
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
      set({ user: null, status: "unauthenticated", bridgeDegraded: false });
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
    set({ user: null, status: "unauthenticated", authId: null, bridgeDegraded: false });
  },

  beginEmailVerification: () => {
    verificationFlowActive = true;
  },

  endEmailVerification: () => {
    verificationFlowActive = false;
  },

  finishEmailVerification: async (accessToken) => {
    try {
      // The verified session must already live in the SDK storage — the OTP
      // screen calls setSession() and confirms with getSession() first.
      const { data } = await getSupabaseBrowserClient().auth.getSession();
      const session = data.session;
      if (!session?.user) {
        return {
          ok: false,
          message:
            "Your verified session could not be stored in this browser. Please try again.",
        };
      }
      setCurrentSupabaseAccessToken(session.access_token);
      // Await the bridge (required) + profile hydration. A failure throws so
      // the caller can show a retry — the app state is left untouched and the
      // valid Supabase session is never destroyed.
      await hydrateFromSupabase(session, { requireBridge: true });
      return { ok: true };
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.message
          : err instanceof Error && err.message
            ? err.message
            : "We couldn't finish signing you in. Please try again.";
      return { ok: false, message };
    }
  },
}));
