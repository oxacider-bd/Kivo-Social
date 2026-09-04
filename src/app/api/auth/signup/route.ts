import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { createSession, hashPassword } from "@/lib/auth";
import { fail, ok, parseBody, route } from "@/lib/api-helpers";
import { signUpSchema } from "@/lib/validation";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { toSessionDTO } from "@/lib/dto";

export const POST = route(async ({ req }: { req: NextRequest }) => {
  if (!rateLimit(`signup:${clientIp(req)}`, 5, 60_000)) return fail("RATE_LIMITED");
  const body = await parseBody(req, signUpSchema);

  const existing = await db.user.findFirst({
    where: { OR: [{ email: body.email }, { profile: { username: body.username } }] },
    select: { email: true, profile: { select: { username: true } } },
  });
  if (existing) {
    if (existing.email === body.email) {
      return fail("CONFLICT", "That email is already registered. Try signing in instead.", 409);
    }
    return fail("CONFLICT", "That username is taken. Try another one.", 409);
  }

  const passwordHash = await hashPassword(body.password);
  const user = await db.user.create({
    data: {
      email: body.email,
      passwordHash,
      profile: { create: { username: body.username, fullName: body.fullName } },
    },
    include: { profile: true },
  });

  await createSession(user.id);
  return ok(toSessionDTO(user));
});
