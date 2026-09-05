import { db, describeDatasource, scrubDbError } from "@/lib/db";
import { ok } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

/**
 * GET /api/db/health — safe production datasource diagnostics.
 * Reports which DATABASE_URL the runtime sees (host/db/schema, credentials
 * stripped) and classifies the live connection result. No secrets returned.
 */
export async function GET() {
  const datasource = describeDatasource();
  const connection = { ok: false, code: null as string | null, detail: null as string | null };
  try {
    await db.$queryRawUnsafe("SELECT 1");
    connection.ok = true;
  } catch (err) {
    const { code, detail } = scrubDbError(err);
    connection.code = code;
    connection.detail = detail;
  }
  return ok({ datasource, connection });
}