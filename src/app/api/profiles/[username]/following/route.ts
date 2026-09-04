import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import {
  getCursorFrom,
  getLimitFrom,
  HttpError,
  makePage,
  ok,
  requireUser,
  route,
} from "@/lib/api-helpers";
import { buildFollowSets, mapProfileCard } from "@/services/posts-service";
import { getProfileByUsernameOr404, getViewerFlags, seekAfter } from "../../_lib/profile-server";
import type { ProfileCardDTO } from "@/types";

type Ctx = { username: string };

// ─── GET /api/profiles/:username/following?cursor ────────────────────────────

export const GET = route<Ctx>(async ({ req, user, params }) => {
  const authed = requireUser(user);
  const profile = await getProfileByUsernameOr404(params.username);
  const viewer = await getViewerFlags(authed.id, profile);

  if (profile.isPrivate && !viewer.canViewContent) {
    throw new HttpError(
      "FORBIDDEN",
      "This account is private. Follow them to see who they follow.",
    );
  }

  const limit = getLimitFrom(req, 20, 50);
  const cursor = getCursorFrom(req);
  const seek = seekAfter(cursor) as unknown as Prisma.FollowWhereInput | null;

  const rows = await db.follow.findMany({
    where: seek
      ? { AND: [{ followerId: profile.userId }, seek] }
      : { followerId: profile.userId },
    include: { following: { include: { profile: true } } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
  });

  const page = makePage(rows, limit);
  const { followingSet, followerSet } = await buildFollowSets(authed.id);
  const items: ProfileCardDTO[] = [];
  for (const row of page.items) {
    if (row.following.profile) {
      items.push(mapProfileCard(row.following.profile, authed.id, followingSet, followerSet));
    }
  }
  return ok({ items, nextCursor: page.nextCursor });
});
