import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { hashPassword, hashToken } from "@/lib/auth";
import { fail, ok, parseBody, route } from "@/lib/api-helpers";
import { resetPasswordSchema } from "@/lib/validation";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const POST = route(async ({ req }: { req: NextRequest }) => {
  if (!rateLimit(`reset:${clientIp(req)}`, 10, 60_000)) return fail("RATE_LIMITED");
  const body = await parseBody(req, resetPasswordSchema);

  const record = await db.passwordReset.findUnique({ where: { tokenHash: hashToken(body.token) } });
  if (!record || record.usedAt || record.expiresAt < new Date()) {
    return fail("VALIDATION", "This reset link is invalid or has expired.", 422);
  }

  const passwordHash = await hashPassword(body.password);
  await db.$transaction([
    db.user.update({ where: { id: record.userId }, data: { passwordHash } }),
    db.passwordReset.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
    // Revoke all sessions — force re-login everywhere after a reset.
    db.session.deleteMany({ where: { userId: record.userId } }),
  ]);

  return ok({ reset: true });
});
