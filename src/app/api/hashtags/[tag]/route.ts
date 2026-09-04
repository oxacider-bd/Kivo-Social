import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import {
  encodeCursor,
  getCursorFrom,
  getLimitFrom,
  ok,
  requireUser,
  route,
} from "@/lib/api-helpers";
import { mapPosts, postInclude, visibleFeedWhere } from "@/services/posts-service";
import { cursorWhere, scorePost, type Cursor } from "@/app/api/search/_shared";

/**
 * GET /api/hashtags/:tag?tab=popular|recent&cursor=
 * → { tag, postCount, page: Page<PostDTO> }
 * Posts joined via PostHashtag + viewer visibility rules.
 * - recent: newest first (keyset cursor)
 * - popular: score = reactions + 2×comments among the tag's newest 100 posts,
 *   then cursor-paginated within that ranked slice.
 */
export const GET = route<{ tag: string }>(async ({ req, user, params }) => {
  const viewer = requireUser(user);
  const tag = decodeURIComponent(params.tag).toLowerCase().replace(/^#/, "").trim();
  const tab = req.nextUrl.searchParams.get("tab") === "popular" ? "popular" : "recent";
  const cursor = getCursorFrom(req);
  const limit = getLimitFrom(req, 10, 30);

  if (!tag) return ok({ tag, postCount: 0, page: { items: [], nextCursor: null } });

  const hashtag = await db.hashtag.findUnique({ where: { tag } });
  if (!hashtag) return ok({ tag, postCount: 0, page: { items: [], nextCursor: null } });

  const visible = await visibleFeedWhere(viewer.id);
  const tagFilter: Prisma.PostWhereInput = {
    hashtags: { some: { hashtagId: hashtag.id } },
  };

  const postCount = await db.post.count({ where: { AND: [visible, tagFilter] } });

  if (tab === "recent") {
    const rows = await db.post.findMany({
      where: { AND: [visible, tagFilter, cursorWhere(cursor)] },
      include: postInclude,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
    });
    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;
    const items = await mapPosts(pageRows, viewer.id);
    const last = pageRows[pageRows.length - 1];
    return ok({
      tag,
      postCount,
      page: {
        items,
        nextCursor: hasMore && last ? encodeCursor(last.createdAt, last.id) : null,
      },
    });
  }

  // popular — fetch the newest 100 visible posts with this tag, score, rank.
  const candidates = await db.post.findMany({
    where: { AND: [visible, tagFilter] },
    include: postInclude,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 100,
  });
  const ranked = candidates
    .map((p) => ({ p, score: scorePost(p) }))
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.p.createdAt.getTime() - a.p.createdAt.getTime() ||
        (a.p.id < b.p.id ? 1 : a.p.id > b.p.id ? -1 : 0),
    );

  let start = 0;
  if (cursor) {
    const idx: number = ranked.findIndex((s) => s.p.id === (cursor as Cursor).id);
    if (idx === -1) {
      return ok({ tag, postCount, page: { items: [], nextCursor: null } });
    }
    start = idx + 1;
  }
  const slice = ranked.slice(start, start + limit + 1);
  const hasMore = slice.length > limit;
  const pageRows = hasMore ? slice.slice(0, limit) : slice;
  const items = await mapPosts(pageRows.map((s) => s.p), viewer.id);
  const last = pageRows[pageRows.length - 1]?.p;
  return ok({
    tag,
    postCount,
    page: {
      items,
      nextCursor: hasMore && last ? encodeCursor(last.createdAt, last.id) : null,
    },
  });
});
