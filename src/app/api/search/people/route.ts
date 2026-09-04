import { db } from "@/lib/db";
import { HttpError, getCursorFrom, getLimitFrom, ok, requireUser, route } from "@/lib/api-helpers";
import { buildFollowSets, mapProfileCard } from "@/services/posts-service";
import { caseVariants, matchesAny, pageFromCandidates } from "../_shared";

/**
 * GET /api/search/people?q=&cursor= → Page<ProfileCardDTO>
 * Username or full name contains (case-insensitive via JS filter),
 * ranked by follower count then username.
 */
export const GET = route(async ({ req, user }) => {
  const viewer = requireUser(user);
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  if (!q) throw new HttpError("VALIDATION", "Type something to search.");

  const qLower = q.toLowerCase();
  const variants = caseVariants(q);
  const cursor = getCursorFrom(req);
  const limit = getLimitFrom(req, 20, 30);

  const rows = await db.profile.findMany({
    where: {
      OR: variants.flatMap((v) => [{ username: { contains: v } }, { fullName: { contains: v } }]),
    },
    include: { user: { select: { _count: { select: { followers: true } } } } },
    take: 120,
  });

  const matched = rows
    .filter((p) => matchesAny([p.username, p.fullName], qLower))
    .sort(
      (a, b) =>
        b.user._count.followers - a.user._count.followers ||
        a.username.localeCompare(b.username),
    );

  const page = pageFromCandidates(matched, cursor, limit);
  const { followingSet, followerSet } = await buildFollowSets(viewer.id);

  return ok({
    items: page.items.map((p) =>
      mapProfileCard(p, viewer.id, followingSet, followerSet),
    ),
    nextCursor: page.nextCursor,
  });
});
