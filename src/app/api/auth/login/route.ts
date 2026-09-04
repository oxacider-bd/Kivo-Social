import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { createSession, verifyPassword } from "@/lib/auth";
import { fail, ok, parseBody, route } from "@/lib/api-helpers";
import { loginSchema } from "@/lib/validation";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { toSessionDTO } from "@/lib/dto";

export const POST = route(async ({ req }: { req: NextRequest }) => {
  if (!rateLimit(`login:${clientIp(req)}`, 10, 60_000)) return fail("RATE_LIMITED");
  const body = await parseBody(req, loginSchema);

  const user = await db.user.findUnique({
    where: { email: body.email },
    include: { profile: true },
  });
  // Uniform error — never reveal whether the email exists.
  if (!user || !(await verifyPassword(body.password, user.passwordHash))) {
    return fail("UNAUTHORIZED", "Email or password is incorrect.", 401);
  }

  await createSession(user.id);
  return ok(toSessionDTO(user));
});
