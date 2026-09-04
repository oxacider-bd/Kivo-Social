import { db } from "@/lib/db";
import { ok, requireUser, route } from "@/lib/api-helpers";
import {
  buildFollowSets,
  mapPosts,
  mapProfileCard,
  postInclude,
  visibleFeedWhere,
} from "@/services/posts-service";
import { scorePost } from "@/app/api/search/_shared";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * GET /api/explore → ExploreDTO
 * - trendingHashtags: top 8 tags by post count over the last 30 days
 * - suggestedUsers: up to 6 profiles the viewer doesn't follow (public, prefers posters)
 * - popularPosts: top 5 visible global posts (last 14 days) scored by reactions + 2×comments
 */
export const GET = route(async ({ user }) => {
  const viewer = requireUser(user);

  const since30d = new Date(Date.now() - 30 * DAY_MS);
  const since14d = new Date(Date.now() - 14 * DAY_MS);

  // ── Trending hashtags ──────────────────────────────────────────────────────
  const tagCounts = await db.postHashtag.groupBy({
    by: ["hashtagId"],
    where: { post: { createdAt: { gt: since30d } } },
    _count: { postId: true },
    orderBy: { _count: { postId: "desc" } },
    take: 8,
  });
  const tagIds = tagCounts.map((t) => t.hashtagId);
  const tagRows = tagIds.length
    ? await db.hashtag.findMany({ where: { id: { in: tagIds } } })
    : [];
  const tagById = new Map(tagRows.map((t) => [t.id, t.tag]));
  const trendingHashtags = tagCounts.map((t) => ({
    tag: tagById.get(t.hashtagId) ?? "",
    postCount: t._count.postId,
  }));

  // ── Suggested users (not self, not followed, public; prefer posters) ───────
  const followingRows = await db.follow.findMany({
    where: { followerId: viewer.id },
    select: { followingId: true },
  });
  const followingIds = followingRows.map((f) => f.followingId);
  const baseWhere = {
    userId: { notIn: [viewer.id, ...followingIds] },
    isPrivate: false,
  };

  const candidateProfiles = await db.profile.findMany({
    where: {
      ...baseWhere,
      OR: [{ user: { posts: { some: {} } } }, { user: { followers: { some: {} } } }],
    },
    include: { user: { select: { _count: { select: { followers: true, posts: true } } } } },
    take: 40,
  });
  const suggested = [...candidateProfiles]
    .sort(
      (a, b) =>
        b.user._count.followers * 2 + b.user._count.posts -
        (a.user._count.followers * 2 + a.user._count.posts),
    )
    .slice(0, 6);
  const { followingSet, followerSet } = await buildFollowSets(viewer.id);
  const suggestedUsers = suggested.map((p) =>
    mapProfileCard(p, viewer.id, followingSet, followerSet),
  );

  // ── Popular posts (last 14 days, global feed only, scored in JS) ──────────
  const visible = await visibleFeedWhere(viewer.id);
  const candidates = await db.post.findMany({
    where: { AND: [visible, { spaceId: null }, { createdAt: { gt: since14d } }] },
    include: postInclude,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 60,
  });
  const top = candidates
    .map((p) => ({ p, score: scorePost(p) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((s) => s.p);
  const popularPosts = await mapPosts(top, viewer.id);

  return ok({ trendingHashtags, suggestedUsers, popularPosts });
});
