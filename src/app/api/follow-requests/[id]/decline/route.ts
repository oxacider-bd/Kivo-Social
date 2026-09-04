import { db } from "@/lib/db";
import { HttpError, ok, requireUser, route } from "@/lib/api-helpers";

type Ctx = { id: string };

// ─── POST /api/follow-requests/:id/decline → {declined: true} ────────────────

export const POST = route<Ctx>(async ({ user, params }) => {
  const authed = requireUser(user);

  const request = await db.followRequest.findUnique({
    where: { id: params.id },
    select: { id: true, targetId: true, status: true },
  });
  if (!request || request.status !== "PENDING") {
    throw new HttpError("NOT_FOUND", "That request is no longer available.");
  }
  if (request.targetId !== authed.id) {
    throw new HttpError("FORBIDDEN", "This request wasn't sent to you.");
  }

  await db.followRequest.delete({ where: { id: request.id } });
  return ok({ declined: true });
});
