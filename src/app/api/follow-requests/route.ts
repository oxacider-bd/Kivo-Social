import { db } from "@/lib/db";
import { ok, requireUser, route } from "@/lib/api-helpers";
import { buildFollowSets, mapProfileCard } from "@/services/posts-service";
import type { FollowRequestDTO } from "@/types";

// ─── GET /api/follow-requests → incoming PENDING requests (limit 30) ─────────

export const GET = route(async ({ user }) => {
  const authed = requireUser(user);

  const rows = await db.followRequest.findMany({
    where: { targetId: authed.id, status: "PENDING" },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 30,
    include: { requester: { include: { profile: true } } },
  });

  const { followingSet, followerSet } = await buildFollowSets(authed.id);
  const items: FollowRequestDTO[] = [];
  for (const row of rows) {
    if (!row.requester.profile) continue;
    items.push({
      id: row.id,
      requester: mapProfileCard(row.requester.profile, authed.id, followingSet, followerSet),
      createdAt: row.createdAt.toISOString(),
    });
  }
  return ok(items);
});
