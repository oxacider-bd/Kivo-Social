import { db } from "@/lib/db";
import { HttpError, ok, requireUser, route } from "@/lib/api-helpers";
import { notify } from "@/lib/notify";

type Ctx = { id: string };

// ─── POST /api/follow-requests/:id/accept → {accepted: true} ─────────────────

export const POST = route<Ctx>(async ({ user, params }) => {
  const authed = requireUser(user);

  const request = await db.followRequest.findUnique({
    where: { id: params.id },
    select: { id: true, requesterId: true, targetId: true, status: true },
  });
  if (!request || request.status !== "PENDING") {
    throw new HttpError("NOT_FOUND", "That request is no longer available.");
  }
  if (request.targetId !== authed.id) {
    throw new HttpError("FORBIDDEN", "This request wasn't sent to you.");
  }

  await db.$transaction([
    db.follow.upsert({
      where: {
        followerId_followingId: {
          followerId: request.requesterId,
          followingId: authed.id,
        },
      },
      update: {},
      create: { followerId: request.requesterId, followingId: authed.id },
    }),
    db.followRequest.delete({ where: { id: request.id } }),
  ]);

  await notify({
    userId: request.requesterId,
    actorId: authed.id,
    type: "follow_accept",
    preview: "accepted your follow request",
  });

  return ok({ accepted: true });
});
