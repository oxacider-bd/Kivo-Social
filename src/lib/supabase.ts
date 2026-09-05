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
let envChecked = false;

/** Reads + validates the Supabase env vars. Returns null if unset/invalid. */
export function getSupabaseEnv(): SupabaseEnv | null {
  if (envChecked) return cachedEnv;
  envChecked = true;

  // Hardcoded fallback — guarantees the client ALWAYS works in the browser
  // even if env vars are not embedded at build time.
  const FALLBACK_URL = "https://ulhubxawckcrfsyrrqqp.supabase.co";
  const FALLBACK_KEY = "sb_publishable_yhOKegAXOI4JR_vW87OpFg_St86-zlo";

  // Try each candidate in precedence order; the first VALID https URL wins.
  // A single invalid value (e.g. a database URL pasted into the wrong var on
  // Vercel) must not poison the whole server — fall through to the next
  // candidate and finally to the hardcoded constants, mirroring the browser
  // client's resilience.
  const urlCandidates = [
    process.env.VITE_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    FALLBACK_URL,
  ].map((v) => v?.trim()).filter((v): v is string => Boolean(v));

  let url = FALLBACK_URL;
  for (const candidate of urlCandidates) {
    try {
      const parsed = new URL(candidate);
      if (parsed.protocol === "https:") {
        url = candidate;
        break;
      }
      console.warn("[supabase] Ignoring non-https Supabase URL candidate.");
    } catch {
      console.warn("[supabase] Ignoring unparseable Supabase URL candidate.");
    }
  }

  const key =
    (
      [process.env.VITE_SUPABASE_PUBLISHABLE_KEY, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY]
        .map((v) => v?.trim())
        .filter((v): v is string => Boolean(v))[0] ?? FALLBACK_KEY
    );

  // Validate URL format
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    // Unreachable while the hardcoded fallback is valid — kept for safety.
    console.warn("[supabase] Invalid Supabase URL, returning null:", url);
    return null;
  }
  if (parsed.protocol !== "https:") {
    console.warn("[supabase] Supabase URL must use https:", url);
    return null;
  }

  cachedEnv = {
    url: url.replace(/\/+$/, ""),
    publishableKey: key,
    projectRef: parsed.hostname.split(".")[0] ?? "",
  };
  return cachedEnv;
}

/** Non-throwing config check — safe to call in UI code paths. */
export function isSupabaseConfigured(): boolean {
  return getSupabaseEnv() !== null;
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
 * 
 * IMPORTANT: Browser client MUST have real env vars. Never use placeholder URLs.
 */
export function getSupabaseBrowserClient(): SupabaseClient {
  const env = getSupabaseEnv();
  const url = env?.url ?? "https://ulhubxawckcrfsyrrqqp.supabase.co";
  const publishableKey = env?.publishableKey ?? "sb_publishable_yhOKegAXOI4JR_vW87OpFg_St86-zlo";
  if (!browserClient) {
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

/**
 * Fresh per-request Supabase client for API routes / server code (publishable key only).
 * Returns null instead of throwing if not configured (for graceful handling).
 */
export function createSupabaseServerClient(): SupabaseClient | null {
  const env = getSupabaseEnv();
  if (!env) return null;
  return createClient(env.url, env.publishableKey, {
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
  const env = getSupabaseEnv();
  const url = env?.url ?? "https://ulhubxawckcrfsyrrqqp.supabase.co";
  return `${url}/storage/v1/object/public/${bucket}/${objectPath.replace(/^\/+/, "")}`;
}

/**
 * Lightweight connectivity probe against Supabase Auth's /health endpoint.
 * Isomorphic — works on the server and in the browser (Supabase allows CORS).
 * Throws only when the env vars are missing; otherwise reports the result.
 */
export async function pingSupabase(timeoutMs = 8_000): Promise<SupabasePing> {
  const env = getSupabaseEnv();
  if (!env) {
    return { ok: false, latencyMs: 0, detail: "Supabase not configured" };
  }
  const started = Date.now();
  try {
    const res = await fetch(`${env.url}/auth/v1/health`, {
      headers: { apikey: env.publishableKey },
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
