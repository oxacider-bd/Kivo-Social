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
  const env = getSupabaseEnv();
  if (!env) {
    return fail(
      "SUPABASE_NOT_CONFIGURED",
      "Supabase environment variables are missing on the server.",
      503
    );
  }

  const ping = await pingSupabase();

  return ok({
    configured: true,
    projectRef: env.projectRef,
    host: new URL(env.url).host,
    keyScope: "publishable" as const,
    ping,
  });
}
