import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * KIVO ⇄ Supabase — the single, centralized Supabase client module.
 *
 * Credentials live ONLY in the project's environment variables (.env, gitignored):
 *   - VITE_SUPABASE_URL                  (preferred naming)
 *   - VITE_SUPABASE_PUBLISHABLE_KEY
 *   - NEXT_PUBLIC_SUPABASE_URL           (equivalent fallback)
 *   - NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
 *
 * The PUBLISHABLE (anon) key is the only key ever used in this codebase.
 * It is designed to be exposed in the browser, and every query remains
 * guarded by the project's Row Level Security policies. No service-role,
 * secret, or admin credential is referenced anywhere.
 */

export interface SupabaseEnv {
  url: string;
  publishableKey: string;
  projectRef: string;
}

export interface SupabasePing {
  ok: boolean;
  latencyMs: number;
  detail?: string;
}

let cachedEnv: SupabaseEnv | null = null;

/** Reads + validates the Supabase env vars. Throws a helpful error when unset. */
export function getSupabaseEnv(): SupabaseEnv {
  if (cachedEnv) return cachedEnv;

  const rawUrl = (
    process.env.VITE_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
  )?.trim();
  const publishableKey = (
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  )?.trim();

  if (!rawUrl || !publishableKey) {
    throw new Error(
      "Supabase is not configured. Set VITE_SUPABASE_URL and " +
        "VITE_SUPABASE_PUBLISHABLE_KEY (or NEXT_PUBLIC_ equivalents) in the project environment (.env)."
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error("VITE_SUPABASE_URL must be a valid URL.");
  }
  if (parsed.protocol !== "https:") {
    throw new Error("VITE_SUPABASE_URL must use https.");
  }

  cachedEnv = {
    url: rawUrl.replace(/\/+$/, ""),
    publishableKey,
    projectRef: parsed.hostname.split(".")[0] ?? "",
  };
  return cachedEnv;
}

/** Non-throwing config check — safe to call in UI code paths. */
export function isSupabaseConfigured(): boolean {
  try {
    getSupabaseEnv();
    return true;
  } catch {
    return false;
  }
}

let browserClient: SupabaseClient | null = null;

// ─── Current access token cache (memory only, client-side) ───────────────────
// The centralized session store keeps this fresh on every auth event (sign in,
// token refresh, sign out). The API client and the upload helper read it to
// attach an `Authorization: Bearer` header so authenticated requests can be
// attributed to the acting Supabase user server-side (RLS-respecting realtime
// fan-out). Nothing is persisted beyond memory — the SDK still owns storage.

let currentAccessToken: string | null = null;

export function setCurrentSupabaseAccessToken(token: string | null): void {
  currentAccessToken = token;
}

export function getCurrentSupabaseAccessToken(): string | null {
  return currentAccessToken;
}

/**
 * Singleton Supabase client for client components.
 * - Sessions persist in localStorage and refresh automatically.
 * - `detectSessionInUrl` exchanges the `?code=` from password-recovery and
 *   email-confirmation links (PKCE flow) into a real session on load.
 */
export function getSupabaseBrowserClient(): SupabaseClient {
  if (!browserClient) {
    const { url, publishableKey } = getSupabaseEnv();
    browserClient = createClient(url, publishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: "pkce",
      },
    });
  }
  return browserClient;
}

/** Fresh per-request Supabase client for API routes / server code (publishable key only). */
export function createSupabaseServerClient(): SupabaseClient {
  const { url, publishableKey } = getSupabaseEnv();
  return createClient(url, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// ─── Storage (buckets provisioned in the Supabase project) ───────────────────

/** App upload kind → Storage bucket. Paths use `<auth.uid()>/…` folder isolation. */
export const SUPABASE_BUCKET_BY_KIND: Record<
  "avatar" | "cover" | "post" | "moment",
  string
> = {
  avatar: "avatars",
  cover: "covers",
  post: "post-media",
  moment: "moment-media",
};

/** Public CDN URL for an object in a public bucket. */
export function supabaseStoragePublicUrl(bucket: string, objectPath: string): string {
  const { url } = getSupabaseEnv();
  return `${url}/storage/v1/object/public/${bucket}/${objectPath.replace(/^\/+/, "")}`;
}

/**
 * Lightweight connectivity probe against Supabase Auth's /health endpoint.
 * Isomorphic — works on the server and in the browser (Supabase allows CORS).
 * Throws only when the env vars are missing; otherwise reports the result.
 */
export async function pingSupabase(timeoutMs = 8_000): Promise<SupabasePing> {
  const started = Date.now();
  try {
    const { url, publishableKey } = getSupabaseEnv();
    const res = await fetch(`${url}/auth/v1/health`, {
      headers: { apikey: publishableKey },
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });
    const latencyMs = Date.now() - started;

    if (!res.ok) {
      let detail = `HTTP ${res.status}`;
      try {
        const body = (await res.json()) as { message?: string };
        if (body?.message) detail = body.message;
      } catch {
        /* keep the HTTP status as detail */
      }
      return { ok: false, latencyMs, detail };
    }
    return { ok: true, latencyMs };
  } catch (err) {
    const latencyMs = Date.now() - started;
    if (err instanceof Error && err.name === "TimeoutError") {
      return { ok: false, latencyMs, detail: "Timed out" };
    }
    return {
      ok: false,
      latencyMs,
      detail: err instanceof Error ? err.message : "Network error",
    };
  }
}
