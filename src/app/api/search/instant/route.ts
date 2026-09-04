import { db } from "@/lib/db";
import { HttpError, ok, requireUser, route } from "@/lib/api-helpers";
import {
  buildFollowSets,
  mapPosts,
  mapProfileCard,
  postInclude,
  visibleFeedWhere,
} from "@/services/posts-service";
import { caseVariants, mapSpace, matchesAny, spaceSearchInclude } from "../_shared";

/**
 * GET /api/search/instant?q= → SearchResultsDTO
 * Fast combined payload for the search dropdown.
 * SQLite `contains` is case-sensitive → fetch bounded candidates with case
 * variants, then filter in JS (fine at this scale).
 */
export const GET = route(async ({ req, user }) => {
  const viewer = requireUser(user);
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  if (!q) throw new HttpError("VALIDATION", "Type something to search.");

  const qLower = q.toLowerCase();
  const qTag = qLower.replace(/^#/, "");
  const variants = caseVariants(q);

  const visible = await visibleFeedWhere(viewer.id);

  const [profileRows, postRows, spaceRows, hashtagRows, followSets] = await Promise.all([
    db.profile.findMany({
      where: {
        OR: variants.flatMap((v) => [{ username: { contains: v } }, { fullName: { contains: v } }]),
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    db.post.findMany({
      where: {
        AND: [
          visible,
          { OR: variants.map((v) => ({ content: { contains: v } })) },
        ],
      },
      include: postInclude,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 50,
    }),
    db.space.findMany({
      where: {
        OR: variants.flatMap((v) => [
          { name: { contains: v } },
          { description: { contains: v } },
        ]),
      },
      include: spaceSearchInclude(viewer.id),
      orderBy: { createdAt: "desc" },
      take: 40,
    }),
    db.hashtag.findMany({
      where: { tag: { startsWith: qTag } },
      include: { _count: { select: { posts: true } } },
      orderBy: { posts: { _count: "desc" } },
      take: 6,
    }),
    buildFollowSets(viewer.id),
  ]);

  const people = profileRows
    .filter((p) => matchesAny([p.username, p.fullName], qLower))
    .slice(0, 5)
    .map((p) => mapProfileCard(p, viewer.id, followSets.followingSet, followSets.followerSet));

  const posts = await mapPosts(
    postRows.filter((p) => matchesAny([p.content], qLower)).slice(0, 5),
    viewer.id,
  );

  const spaces = spaceRows
    .filter((s) => matchesAny([s.name, s.description], qLower))
    .slice(0, 4)
    .map(mapSpace);

  const hashtags = hashtagRows.map((h) => ({ tag: h.tag, postCount: h._count.posts }));

  return ok({ people, posts, spaces, hashtags });
});
