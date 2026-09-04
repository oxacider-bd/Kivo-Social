import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/auth";
import { fail, ok, parseBody, requireUser, route } from "@/lib/api-helpers";
import { changePasswordSchema } from "@/lib/validation";

export const POST = route(async ({ req, user }) => {
  const authed = requireUser(user);
  const body = await parseBody(req, changePasswordSchema);

  const dbUser = await db.user.findUnique({ where: { id: authed.id } });
  if (!dbUser || !(await verifyPassword(body.currentPassword, dbUser.passwordHash))) {
    return fail("VALIDATION", "Your current password is incorrect.", 422);
  }

  const passwordHash = await hashPassword(body.newPassword);
  await db.user.update({ where: { id: authed.id }, data: { passwordHash } });
  return ok({ changed: true });
});
