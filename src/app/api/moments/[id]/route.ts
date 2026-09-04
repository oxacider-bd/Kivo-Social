import { db } from "@/lib/db";
import { HttpError, ok, requireUser, route } from "@/lib/api-helpers";

// DELETE /api/moments/:id → { deleted: true } — author only.
export const DELETE = route<{ id: string }>(async ({ params, user }) => {
  const authed = requireUser(user);
  const moment = await db.moment.findUnique({
    where: { id: params.id },
    select: { id: true, authorId: true },
  });
  if (!moment) throw new HttpError("NOT_FOUND", "That moment isn't available.");
  if (moment.authorId !== authed.id) {
    throw new HttpError("FORBIDDEN", "You can only delete your own moments.");
  }
  await db.moment.delete({ where: { id: moment.id } });
  return ok({ deleted: true });
});
