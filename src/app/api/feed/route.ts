import type { NextRequest } from "next/server";
import {
  getCursorFrom,
  getLimitFrom,
  makePage,
  ok,
  requireUser,
  route,
} from "@/lib/api-helpers";
import { db } from "@/lib/db";
import { mapPosts, postInclude, visibleFeedWhere } from "@/services/posts-service";

/**
 * GET /api/feed?cursor&limit — the global home feed.
 * Self + public posts of public authors + non-ONLY_ME posts of followed authors.
 * Space posts are excluded (they live in their space's feed).
 */
export const GET = route(async ({ req, user }) => {
  const authed = requireUser(user);
  const limit = getLimitFrom(req, 10, 30);
  const cursor = getCursorFrom(req);

  const visibility = await visibleFeedWhere(authed.id);
  const rows = await db.post.findMany({
    where: {
      AND: [
        visibility,
        { spaceId: null },
        cursor
          ? {
              OR: [
                { createdAt: { lt: cursor.createdAt } },
                { AND: [{ createdAt: cursor.createdAt }, { id: { lt: cursor.id } }] },
              ],
            }
          : {},
      ],
    },
    include: postInclude,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
  });

  const page = makePage(rows, limit);
  const items = await mapPosts(page.items, authed.id);
  return ok({ items, nextCursor: page.nextCursor });
});
