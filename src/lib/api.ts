"use client";

import { getCurrentSupabaseAccessToken } from "@/lib/supabase";

export class ApiError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  formData?: FormData;
  signal?: AbortSignal;
}

/**
 * Typed fetch against the KIVO API envelope: { ok, data } | { ok, error }.
 * Throws ApiError with a friendly message on failure.
 */
export async function api<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  // Forward the acting Supabase identity to API routes (when signed in) so the
  // server can perform RLS-respecting Supabase-side writes (realtime fan-out).
  const accessToken = getCurrentSupabaseAccessToken();
  const authHeaders = accessToken ? { authorization: `Bearer ${accessToken}` } : undefined;
  let res: Response;
  try {
    res = await fetch(path, {
      method: opts.method ?? (opts.body || opts.formData ? "POST" : "GET"),
      headers: opts.formData
        ? authHeaders
        : { "content-type": "application/json", ...authHeaders },
      body: opts.formData ?? (opts.body != null ? JSON.stringify(opts.body) : undefined),
      signal: opts.signal,
      credentials: "same-origin",
    });
  } catch (err) {
    if ((err as Error)?.name === "AbortError") throw err;
    throw new ApiError("NETWORK", "You seem offline. Check your connection.", 0);
  }

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    throw new ApiError("INTERNAL", "Something went wrong on our side. Please try again.", res.status);
  }

  const envelope = json as { ok: boolean; data?: T; error?: { code: string; message: string } };
  if (!res.ok || !envelope.ok) {
    throw new ApiError(
      envelope.error?.code ?? "INTERNAL",
      envelope.error?.message ?? "Something went wrong. Please try again.",
      res.status,
    );
  }
  return envelope.data as T;
}
