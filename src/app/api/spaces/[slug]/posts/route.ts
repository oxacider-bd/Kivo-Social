import { db } from "@/lib/db";
import {
  buildFollowSets,
  mapPost,
  postInclude,
} from "@/services/posts-service";
import {
  getCursorFrom,
  getLimitFrom,
  makePage,
  ok,
  requireUser,
  route,
} from "@/lib/api-helpers";
import { requireSpace } from "@/features/spaces/server/space-mapper";
import type { Page, PostDTO } from "@/types";

// GET /api/spaces/:slug/posts?cursor → Page<PostDTO> — newest first, public read.
export const GET = route<{ slug: string }>(async ({ params, req, user }) => {
  const authed = requireUser(user);
  const space = await requireSpace(params.slug);
  const cursor = getCursorFrom(req);
  const limit = getLimitFrom(req, 10, 30);

  const posts = await db.post.findMany({
    where: {
      spaceId: space.id,
      ...(cursor
        ? {
            OR: [
              { createdAt: { lt: cursor.createdAt } },
              { createdAt: cursor.createdAt, id: { lt: cursor.id } },
            ],
          }
        : {}),
    },
    include: postInclude,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
  });

  const page = makePage(posts, limit);
  const { followingSet } = await buildFollowSets(authed.id);
  const items: PostDTO[] = page.items.map((p) => mapPost(p, authed.id, followingSet));
  const result: Page<PostDTO> = { items, nextCursor: page.nextCursor };
  return ok(result);
});
