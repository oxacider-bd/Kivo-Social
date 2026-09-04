import { db } from "@/lib/db";
import {
  encodeCursor,
  getCursorFrom,
  getLimitFrom,
  ok,
  requireUser,
  route,
} from "@/lib/api-helpers";
import { mapPosts, postInclude } from "@/services/posts-service";

/**
 * GET /api/saved?cursor= → Page<PostDTO> & { total: number }
 * The viewer's saved posts, newest saved first.
 * (Writing/unsaving lives in agent 2-a's POST/DELETE /api/posts/:id/save.)
 */
export const GET = route(async ({ req, user }) => {
  const viewer = requireUser(user);
  const cursor = getCursorFrom(req);
  const limit = getLimitFrom(req, 10, 30);

  const cursorWhere = cursor
    ? {
        OR: [
          { createdAt: { lt: cursor.createdAt } },
          { createdAt: cursor.createdAt, id: { lt: cursor.id } },
        ],
      }
    : {};

  const [rows, total] = await Promise.all([
    db.savedPost.findMany({
      where: { userId: viewer.id, ...cursorWhere },
      include: { post: { include: postInclude } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
    }),
    db.savedPost.count({ where: { userId: viewer.id } }),
  ]);

  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;
  const items = await mapPosts(
    pageRows.map((r) => r.post),
    viewer.id,
  );
  const last = pageRows[pageRows.length - 1];

  return ok({
    items,
    nextCursor: hasMore && last ? encodeCursor(last.createdAt, last.id) : null,
    total,
  });
});
