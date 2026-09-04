import { db } from "@/lib/db";
import { HttpError, ok, requireUser, route } from "@/lib/api-helpers";
import { buildFollowSets, mapProfileCard } from "@/services/posts-service";
import type { ProfileCardDTO, ReactionType } from "@/types";

// GET /api/moments/:id/stats → author-only insight: views, viewers, reactions.
export const GET = route<{ id: string }>(async ({ params, user }) => {
  const authed = requireUser(user);
  const moment = await db.moment.findUnique({
    where: { id: params.id },
    select: { id: true, authorId: true },
  });
  if (!moment) throw new HttpError("NOT_FOUND", "That moment isn't available.");
  if (moment.authorId !== authed.id) {
    throw new HttpError("FORBIDDEN", "Only the author can see moment insights.");
  }

  const [views, viewerRows, reactionRows, { followingSet, followerSet }] = await Promise.all([
    db.momentView.count({ where: { momentId: moment.id } }),
    db.momentView.findMany({
      where: { momentId: moment.id },
      include: { user: { include: { profile: true } } },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    db.momentReaction.findMany({
      where: { momentId: moment.id },
      include: { user: { include: { profile: true } } },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    buildFollowSets(authed.id),
  ]);

  const card = (profile: (typeof viewerRows)[number]["user"]["profile"]): ProfileCardDTO => {
    if (!profile) throw new Error("Profile missing");
    return mapProfileCard(profile, authed.id, followingSet, followerSet);
  };

  return ok({
    views,
    viewers: viewerRows.map((v) => v.user.profile ? card(v.user.profile) : null).filter((x): x is ProfileCardDTO => x !== null),
    reactions: reactionRows
      .filter((r) => r.user.profile)
      .map((r) => ({
        profile: card(r.user.profile!),
        type: r.type as ReactionType,
        createdAt: r.createdAt.toISOString(),
      })),
  });
});
