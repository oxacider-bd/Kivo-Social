import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Per-request context captured by the API route wrapper (`src/lib/api-helpers.ts`).
 *
 * Today it carries the optional Supabase `Authorization` header forwarded by
 * the API client. Server-side helpers that mirror data into Supabase (the
 * realtime notification fan-out) use it to act AS the authenticated user so
 * Row Level Security stays the authorization layer — no service-role key.
 */
export interface RequestContext {
  /** Raw `Authorization` header value ("Bearer <supabase-access-token>") or null. */
  authorization: string | null;
  /** Request origin (e.g. "https://kivo-rho-pearl.vercel.app") for push deep links. */
  origin: string | null;
}

const storage = new AsyncLocalStorage<RequestContext>();

/** Runs `fn` inside the given request context (called once per API request). */
export function runWithRequestContext<T>(context: RequestContext, fn: () => Promise<T>): Promise<T> {
  return storage.run(context, fn);
}

/** The acting user's Authorization header for the current request, if any. */
export function getRequestAuthorization(): string | null {
  return storage.getStore()?.authorization ?? null;
}

/** The current request's origin (for push deep links), if available. */
export function getRequestOrigin(): string | null {
  return storage.getStore()?.origin ?? null;
}
