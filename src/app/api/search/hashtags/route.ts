import { db } from "@/lib/db";
import { HttpError, getCursorFrom, getLimitFrom, ok, requireUser, route } from "@/lib/api-helpers";
import { pageFromCandidates } from "../_shared";

/**
 * GET /api/search/hashtags?q=&cursor= → Page<HashtagDTO>
 * Tags are stored lowercase; match with contains on the lowercased query
 * (leading `#` tolerated). Ranked by post count.
 */
export const GET = route(async ({ req, user }) => {
  const viewer = requireUser(user);
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim().toLowerCase().replace(/^#/, "");
  if (!q) throw new HttpError("VALIDATION", "Type something to search.");

  const cursor = getCursorFrom(req);
  const limit = getLimitFrom(req, 15, 30);

  const rows = await db.hashtag.findMany({
    where: { tag: { contains: q } },
    include: { _count: { select: { posts: true } } },
    take: 100,
  });

  const matched = rows
    .filter((h) => h.tag.toLowerCase().includes(q))
    .sort((a, b) => b._count.posts - a._count.posts || a.tag.localeCompare(b.tag));

  const page = pageFromCandidates(matched, cursor, limit);

  return ok({
    items: page.items.map((h) => ({ tag: h.tag, postCount: h._count.posts })),
    nextCursor: page.nextCursor,
  });
});
