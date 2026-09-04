import { db } from "@/lib/db";
import { getFollowingIds, buildFollowSets } from "@/services/posts-service";
import {
  HttpError,
  ok,
  parseBody,
  requireUser,
  route,
} from "@/lib/api-helpers";
import { createMomentSchema } from "@/lib/validation";
import { mapMoment, momentInclude } from "@/features/moments/server/moment-mapper";
import type { MomentAuthorGroupDTO, MomentDTO } from "@/types";

const GROUP_LIMIT = 30;
const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

// GET /api/moments → MomentAuthorGroupDTO[] — active moments from self + followed authors.
export const GET = route(async ({ user }) => {
  const authed = requireUser(user);
  const now = new Date();

  const followingIds = await getFollowingIds(authed.id);
  const authorIds = [authed.id, ...followingIds];

  const moments = await db.moment.findMany({
    where: { expiresAt: { gt: now }, authorId: { in: authorIds } },
    include: momentInclude,
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });

  const { followingSet, followerSet } = await buildFollowSets(authed.id);

  // Group moments by author (insertion order keeps each group oldest → newest).
  const byAuthor = new Map<string, MomentDTO[]>();
  for (const m of moments) {
    const list = byAuthor.get(m.authorId) ?? [];
    list.push(mapMoment(m, authed.id, followingSet, followerSet));
    byAuthor.set(m.authorId, list);
  }

  const groups: MomentAuthorGroupDTO[] = [];
  for (const [authorId, list] of byAuthor) {
    const latest = list[list.length - 1];
    if (!latest) continue;
    groups.push({
      author: latest.author,
      isSelf: authorId === authed.id,
      allSeen: list.every((m) => m.viewerSeen),
      latestAt: latest.createdAt,
      moments: list,
    });
  }

  // Self first, then most-recent activity.
  groups.sort(
    (a, b) =>
      Number(b.isSelf) - Number(a.isSelf) || b.latestAt.localeCompare(a.latestAt),
  );

  return ok(groups.slice(0, GROUP_LIMIT));
});

// POST /api/moments → MomentDTO — creates a 24h moment.
export const POST = route(async ({ req, user }) => {
  const authed = requireUser(user);
  const input = await parseBody(req, createMomentSchema);

  const isMedia = input.type === "image" || input.type === "video";
  const moment = await db.moment.create({
    data: {
      authorId: authed.id,
      type: input.type,
      content: input.content,
      mediaUrl: isMedia ? (input.mediaUrl ?? null) : null,
      mediaType: isMedia ? (input.mediaType ?? input.type) : null,
      background: input.type === "text" ? (input.background ?? null) : null,
      expiresAt: new Date(Date.now() + TWENTY_FOUR_HOURS_MS),
    },
  });

  if (input.type === "poll" && input.poll) {
    await db.poll.create({
      data: {
        momentId: moment.id,
        options: {
          create: input.poll.options.map((text, position) => ({ text, position })),
        },
      },
    });
  }

  const fresh = await db.moment.findUnique({
    where: { id: moment.id },
    include: momentInclude,
  });
  if (!fresh) throw new HttpError("INTERNAL", "Moment disappeared right after creation.");

  const { followingSet, followerSet } = await buildFollowSets(authed.id);
  return ok(mapMoment(fresh, authed.id, followingSet, followerSet), { status: 201 });
});
