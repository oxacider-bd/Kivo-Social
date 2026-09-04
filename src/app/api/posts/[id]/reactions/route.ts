import {
  getLimitFrom,
  ok,
  parseBody,
  requireUser,
  route,
} from "@/lib/api-helpers";
import { db } from "@/lib/db";
import { notify } from "@/lib/notify";
import { buildFollowSets, mapProfileCard } from "@/services/posts-service";
import { reactionSchema } from "@/lib/validation";
import { requireVisiblePost } from "@/features/posts/server/post-guard";
import type { ReactionToggleDTO, ReactionType } from "@/types";

const REACTION_LABELS: Record<string, string> = {
  LOVE: "Love",
  FUNNY: "Funny",
  WOW: "Wow",
  SAD: "Sad",
  FIRE: "Fire",
  SUPPORT: "Support",
};

// ─── GET /api/posts/:id/reactions?type= → ReactionUserDTO[] ─────────────────

export const GET = route<{ id: string }>(async ({ req, user, params }) => {
  const authed = requireUser(user);
  await requireVisiblePost(params.id, authed.id);

  const type = req.nextUrl.searchParams.get("type");
  const limit = getLimitFrom(req, 50, 50);

  const rows = await db.reaction.findMany({
    where: { postId: params.id, ...(type ? { type } : {}) },
    include: { user: { include: { profile: true } } },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  const { followingSet, followerSet } = await buildFollowSets(authed.id);
  const users = rows.flatMap((r) => {
    const profile = r.user.profile;
    if (!profile) return [];
    return [
      {
        profile: mapProfileCard(profile, authed.id, followingSet, followerSet),
        type: r.type as ReactionType,
        createdAt: r.createdAt.toISOString(),
      },
    ];
  });
  return ok(users);
});

// ─── POST /api/posts/:id/reactions → ReactionToggleDTO (toggle) ─────────────

export const POST = route<{ id: string }>(async ({ req, user, params }) => {
  const authed = requireUser(user);
  const body = await parseBody(req, reactionSchema);
  const post = await requireVisiblePost(params.id, authed.id);

  const existing = await db.reaction.findUnique({
    where: { userId_postId: { userId: authed.id, postId: params.id } },
  });

  let creating = false;
  if (existing && existing.type === body.type) {
    await db.reaction.delete({ where: { id: existing.id } });
  } else if (existing) {
    await db.reaction.update({ where: { id: existing.id }, data: { type: body.type } });
  } else {
    await db.reaction.create({
      data: { userId: authed.id, postId: params.id, type: body.type },
    });
    creating = true;
  }

  if (creating) {
    await notify({
      userId: post.authorId,
      actorId: authed.id,
      type: "reaction",
      postId: params.id,
      preview: REACTION_LABELS[body.type] ?? "Reacted to your post",
    });
  }

  // Recompute counts with a single targeted groupBy (no full post refetch).
  const grouped = await db.reaction.groupBy({
    by: ["type"],
    where: { postId: params.id },
    _count: { type: true },
  });
  const topReactions = grouped
    .map((g) => ({ type: g.type as ReactionType, count: g._count.type }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);
  const dto: ReactionToggleDTO = {
    counts: { reactions: grouped.reduce((sum, g) => sum + g._count.type, 0) },
    topReactions,
    viewerReaction: existing?.type === body.type ? null : body.type,
  };
  return ok(dto);
});
