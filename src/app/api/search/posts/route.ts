import { db } from "@/lib/db";
import { HttpError, getCursorFrom, getLimitFrom, ok, requireUser, route } from "@/lib/api-helpers";
import { mapPosts, postInclude, visibleFeedWhere } from "@/services/posts-service";
import { caseVariants, matchesAny, pageFromCandidates } from "../_shared";

/**
 * GET /api/search/posts?q=&cursor= → Page<PostDTO>
 * Content contains + visibility rules (visibleFeedWhere), newest first.
 */
export const GET = route(async ({ req, user }) => {
  const viewer = requireUser(user);
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  if (!q) throw new HttpError("VALIDATION", "Type something to search.");

  const qLower = q.toLowerCase();
  const variants = caseVariants(q);
  const cursor = getCursorFrom(req);
  const limit = getLimitFrom(req, 10, 30);

  const visible = await visibleFeedWhere(viewer.id);
  const rows = await db.post.findMany({
    where: {
      AND: [visible, { OR: variants.map((v) => ({ content: { contains: v } })) }],
    },
    include: postInclude,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 120,
  });

  const matched = rows.filter((p) => matchesAny([p.content], qLower));
  const page = pageFromCandidates(matched, cursor, limit);
  const items = await mapPosts(page.items, viewer.id);

  return ok({ items, nextCursor: page.nextCursor });
});
