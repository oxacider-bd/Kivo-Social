import { db } from "@/lib/db";
import { buildFollowSets } from "@/services/posts-service";
import {
  getCursorFrom,
  getLimitFrom,
  makePage,
  ok,
  requireUser,
  route,
} from "@/lib/api-helpers";
import { mapSpaceMember, requireSpace } from "@/features/spaces/server/space-mapper";
import type { Page, SpaceMemberDTO } from "@/types";

// GET /api/spaces/:slug/members?cursor → Page<SpaceMemberDTO> — oldest first (owner first).
export const GET = route<{ slug: string }>(async ({ params, req, user }) => {
  const authed = requireUser(user);
  const space = await requireSpace(params.slug);
  const cursor = getCursorFrom(req);
  const limit = getLimitFrom(req, 20, 50);

  const members = await db.spaceMember.findMany({
    where: {
      spaceId: space.id,
      ...(cursor
        ? {
            OR: [
              { createdAt: { gt: cursor.createdAt } },
              { createdAt: cursor.createdAt, id: { gt: cursor.id } },
            ],
          }
        : {}),
    },
    include: { user: { include: { profile: true } } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: limit + 1,
  });

  const page = makePage(members, limit);
  const { followingSet, followerSet } = await buildFollowSets(authed.id);
  const items: SpaceMemberDTO[] = page.items.map((m) =>
    mapSpaceMember(m, authed.id, followingSet, followerSet),
  );
  const result: Page<SpaceMemberDTO> = { items, nextCursor: page.nextCursor };
  return ok(result);
});
