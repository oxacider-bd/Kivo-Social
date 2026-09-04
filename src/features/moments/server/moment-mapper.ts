import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { HttpError } from "@/lib/api-helpers";
import { mapProfileCard } from "@/services/posts-service";
import type { MomentDTO, MomentType, PollDTO, ReactionType , ProfileCardDTO } from "@/types";

// ─── Moment include + mappers (shared by all /api/moments routes) ────────────

export const momentInclude = {
  author: { include: { profile: true } },
  views: { select: { userId: true, createdAt: true } },
  reactions: { select: { userId: true, type: true, createdAt: true } },
  poll: { include: { options: { include: { votes: { select: { userId: true } } } } } },
} satisfies Prisma.MomentInclude;

export type MomentWithRelations = Prisma.MomentGetPayload<{ include: typeof momentInclude }>;

export function mapPoll(
  poll: {
    id: string;
    endsAt: Date | null;
    options: { id: string; text: string; position: number; votes: { userId: string }[] }[];
  },
  viewerId: string | null,
): PollDTO {
  const options = [...poll.options]
    .sort((a, b) => a.position - b.position)
    .map((o) => ({
      id: o.id,
      text: o.text,
      voteCount: o.votes.length,
      votedByViewer: viewerId ? o.votes.some((v) => v.userId === viewerId) : false,
    }));
  return {
    id: poll.id,
    options,
    totalVotes: options.reduce((s, o) => s + o.voteCount, 0),
    endsAt: poll.endsAt?.toISOString() ?? null,
  };
}

/**
 * Maps a Moment row (with `momentInclude` relations) into a MomentDTO.
 * Self moments additionally expose viewCount / reactionCount / viewerReaction.
 */
export function mapMoment(
  moment: MomentWithRelations,
  viewerId: string | null,
  followingSet: Set<string>,
  followerSet: Set<string>,
): MomentDTO {
  const isSelf = viewerId === moment.authorId;
  const viewerSeen = viewerId ? moment.views.some((v) => v.userId === viewerId) : false;
  const viewerReaction =
    (moment.reactions.find((r) => r.userId === viewerId)?.type as ReactionType) ?? null;

  return {
    id: moment.id,
    type: moment.type as MomentType,
    content: moment.content,
    mediaUrl: moment.mediaUrl,
    mediaType: (moment.mediaType as "image" | "video" | null) ?? null,
    background: moment.background,
    poll: moment.poll ? mapPoll(moment.poll, viewerId) : null,
    expiresAt: moment.expiresAt.toISOString(),
    createdAt: moment.createdAt.toISOString(),
    author: moment.author.profile
      ? mapProfileCard(moment.author.profile, viewerId, followingSet, followerSet)
      : ({
          id: "", userId: moment.authorId, username: "unknown", fullName: "Unknown",
          avatarUrl: null, bio: "", isPrivate: false, mood: "",
          viewer: { isSelf: false, isFollowing: false, isRequested: false, followsViewer: false },
        } as ProfileCardDTO),
    viewerSeen,
    ...(isSelf
      ? {
          viewCount: moment.views.length,
          reactionCount: moment.reactions.length,
          viewerReaction,
        }
      : {}),
  };
}

/**
 * Fetches an active (non-expired) moment and enforces viewer visibility:
 * author themself or a follower of the author. Throws NOT_FOUND / FORBIDDEN.
 */
export async function requireVisibleMoment(momentId: string, viewerId: string) {
  const moment = await db.moment.findUnique({
    where: { id: momentId },
    select: { id: true, authorId: true, expiresAt: true },
  });
  if (!moment || moment.expiresAt <= new Date()) {
    throw new HttpError("NOT_FOUND", "That moment isn't available — it may have expired.");
  }
  if (moment.authorId !== viewerId) {
    const follow = await db.follow.findUnique({
      where: {
        followerId_followingId: { followerId: viewerId, followingId: moment.authorId },
      },
      select: { id: true },
    });
    if (!follow) throw new HttpError("FORBIDDEN", "Only followers can interact with this moment.");
  }
  return moment;
}
