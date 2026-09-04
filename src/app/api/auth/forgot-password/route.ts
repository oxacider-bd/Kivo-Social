import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { generateToken, hashToken } from "@/lib/auth";
import { ok, parseBody, route } from "@/lib/api-helpers";
import { forgotPasswordSchema } from "@/lib/validation";
import { clientIp, rateLimit } from "@/lib/rate-limit";

/**
 * Always responds ok (no account enumeration). In this environment there is no
 * mail provider, so the reset link is returned for in-app delivery when the
 * request context is the same browser (dev-mode convenience, token is single-use + 1h TTL).
 */
export const POST = route(async ({ req }: { req: NextRequest }) => {
  if (!rateLimit(`forgot:${clientIp(req)}`, 5, 60_000)) return ok({ sent: true, resetToken: null });
  const body = await parseBody(req, forgotPasswordSchema);

  const user = await db.user.findUnique({ where: { email: body.email } });
  if (!user) return ok({ sent: true, resetToken: null });

  const token = generateToken();
  await db.passwordReset.create({
    data: {
      tokenHash: hashToken(token),
      userId: user.id,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    },
  });

  return ok({ sent: true, resetToken: token });
});
