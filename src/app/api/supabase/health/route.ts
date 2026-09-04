import { getSupabaseEnv, pingSupabase } from "@/lib/supabase";
import { fail, ok } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

/**
 * GET /api/supabase/health
 *
 * Server-side connectivity check against the configured Supabase project.
 * Uses the publishable key only — unauthenticated, no user data touched.
 * An unreachable Supabase is reported inside the envelope (ping.ok = false)
 * so the UI can render "Unreachable" with detail; only a missing env
 * configuration fails the request.
 */
export async function GET() {
  const configured = isConfiguredSafe();
  if (!configured) {
    return fail(
      "SUPABASE_NOT_CONFIGURED",
      "Supabase environment variables are missing on the server.",
      503
    );
  }

  const env = getSupabaseEnv();
  const ping = await pingSupabase();

  return ok({
    configured: true,
    projectRef: env.projectRef,
    host: new URL(env.url).host,
    keyScope: "publishable" as const,
    ping,
  });
}

/** getSupabaseEnv throws when unset — wrap so we can return a 503 envelope instead. */
function isConfiguredSafe(): boolean {
  try {
    getSupabaseEnv();
    return true;
  } catch {
    return false;
  }
}
