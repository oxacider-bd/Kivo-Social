import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { HttpError } from "@/lib/api-helpers";
import { mapProfile } from "@/lib/dto";
import type { ProfileDetailDTO } from "@/types";

/**
 * Shared server helpers for the profile/follow/settings domain (task 2-c).
 * Lives in a `_lib` private folder so Next.js never treats it as a route.
 */

export type ProfileRow = Prisma.ProfileGetPayload<{
  include: {
    user: {
      select: {
        id: true;
        _count: { select: { posts: true; followers: true; following: true } };
      };
    };
  };
}>;

const profileWithCountsInclude = {
  user: {
    select: {
      id: true,
      _count: { select: { posts: true, followers: true, following: true } },
    },
  },
} satisfies Prisma.ProfileInclude;

/** Resolves a profile by username (usernames are stored lowercase). 404 when missing. */
export async function getProfileByUsernameOr404(username: string): Promise<ProfileRow> {
  const profile = await db.profile.findUnique({
    where: { username: username.toLowerCase() },
    include: profileWithCountsInclude,
  });
  if (!profile) throw new HttpError("NOT_FOUND", "This account doesn't exist… yet.");
  return profile;
}

export interface ViewerFlags {
  isSelf: boolean;
  isFollowing: boolean;
  isRequested: boolean;
  followsViewer: boolean;
  canViewContent: boolean;
}

/** Computes the viewer relationship flags for a target profile. */
export async function getViewerFlags(
  viewerId: string,
  target: { userId: string; isPrivate: boolean },
): Promise<ViewerFlags> {
  const isSelf = viewerId === target.userId;
  if (isSelf) {
    return {
      isSelf: true,
      isFollowing: false,
      isRequested: false,
      followsViewer: false,
      canViewContent: true,
    };
  }
  const [followingRow, requestedRow, followsViewerRow] = await Promise.all([
    db.follow.findFirst({
      where: { followerId: viewerId, followingId: target.userId },
      select: { id: true },
    }),
    db.followRequest.findFirst({
      where: { requesterId: viewerId, targetId: target.userId, status: "PENDING" },
      select: { id: true },
    }),
    db.follow.findFirst({
      where: { followerId: target.userId, followingId: viewerId },
      select: { id: true },
    }),
  ]);
  const isFollowing = !!followingRow;
  return {
    isSelf,
    isFollowing,
    isRequested: !!requestedRow,
    followsViewer: !!followsViewerRow,
    canViewContent: isSelf || !target.isPrivate || isFollowing,
  };
}

/** Assembles a ProfileDetailDTO from a profile row + viewer flags (counts always included). */
export function toProfileDetail(profile: ProfileRow, viewer: ViewerFlags): ProfileDetailDTO {
  return {
    ...mapProfile(profile),
    counts: {
      posts: profile.user._count.posts,
      followers: profile.user._count.followers,
      following: profile.user._count.following,
    },
    viewer,
  };
}

/**
 * Keyset seek predicate for (createdAt DESC, id DESC) ordered lists.
 * Returns an OR fragment to AND into the base where clause, or null on first page.
 */
export function seekAfter(
  cursor: { createdAt: Date; id: string } | null,
): Prisma.PostWhereInput | null {
  if (!cursor) return null;
  return {
    OR: [
      { createdAt: { lt: cursor.createdAt } },
      { createdAt: cursor.createdAt, id: { lt: cursor.id } },
    ],
  } as Prisma.PostWhereInput;
}
