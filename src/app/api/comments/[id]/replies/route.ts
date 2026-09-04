import {
  getCursorFrom,
  getLimitFrom,
  makePage,
  ok,
  requireUser,
  route,
} from "@/lib/api-helpers";
import { db } from "@/lib/db";
import { commentInclude, mapComment } from "@/services/posts-service";
import type { Page, CommentDTO } from "@/types";

/** mapComment's structural type keeps full reply rows; commentInclude selects ids only. */
type MappableComment = Parameters<typeof mapComment>[0];

/**
 * GET /api/comments/:id/replies → Page<CommentDTO>
 * Replies of a top-level comment, oldest first (chronological order reads
 * best inside a thread). Soft-deleted replies can't exist by design, but
 * we filter defensively.
 */
export const GET = route<{ id: string }>(async ({ req, user, params }) => {
  const authed = requireUser(user);
  const limit = getLimitFrom(req, 10, 30);
  const cursor = getCursorFrom(req);

  const rows = await db.comment.findMany({
    where: {
      parentId: params.id,
      deletedAt: null,
      ...(cursor
        ? {
            OR: [
              { createdAt: { gt: cursor.createdAt } },
              { AND: [{ createdAt: cursor.createdAt }, { id: { gt: cursor.id } }] },
            ],
          }
        : {}),
    },
    include: commentInclude,
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: limit + 1,
  });

  const rawPage = makePage(rows, limit);
  const page: Page<CommentDTO> = {
    items: rawPage.items.map((c) => mapComment(c as MappableComment, authed.id)),
    nextCursor: rawPage.nextCursor,
  };
  return ok(page);
});
