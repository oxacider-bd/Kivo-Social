import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { createSession } from "@/lib/auth";
import { fail, ok, route } from "@/lib/api-helpers";
import { toSessionDTO } from "@/lib/dto";
import { clientIp, rateLimit } from "@/lib/rate-limit";

/**
 * One-click demo entry — part of the KIVO product experience.
 *
 * Security notes:
 *  - The demo session is provisioned SERVER-SIDE; no password exists in the
 *    client bundle and none is transmitted.
 *  - The endpoint is rate-limited and can be disabled entirely by setting
 *    DEMO_LOGIN_ENABLED=false (e.g. on a hardened production deployment).
 *  - The demo account is a fictional seeded persona, never a real user.
 */
const DEMO_LOGIN_EMAIL = (process.env.DEMO_LOGIN_EMAIL ?? "maya@kivo.app").toLowerCase();

export const POST = route(async ({ req }: { req: NextRequest }) => {
  if (process.env.DEMO_LOGIN_ENABLED === "false") {
    return fail("FORBIDDEN", "Demo login is disabled on this deployment.", 403);
  }
  if (!rateLimit(`demo-login:${clientIp(req)}`, 10, 60_000)) return fail("RATE_LIMITED");

  const user = await db.user.findUnique({
    where: { email: DEMO_LOGIN_EMAIL },
    include: { profile: true },
  });
  if (!user) {
    return fail("NOT_FOUND", "The demo account isn't available right now.", 404);
  }

  await createSession(user.id);
  return ok(toSessionDTO(user));
});
