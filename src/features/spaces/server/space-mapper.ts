import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { HttpError } from "@/lib/api-helpers";
import { mapProfileCard } from "@/services/posts-service";
import type { SpaceDTO, SpaceMemberDTO, SpaceRole , ProfileCardDTO } from "@/types";

// ─── Space mappers + slug helpers (shared by all /api/spaces routes) ─────────

export type SpaceWithCounts = Prisma.SpaceGetPayload<{
  include: { _count: { select: { members: true; posts: true } } };
}>;

export function mapSpace(
  space: SpaceWithCounts,
  membership: { role: string } | null | undefined,
): SpaceDTO {
  return {
    id: space.id,
    slug: space.slug,
    name: space.name,
    description: space.description,
    coverUrl: space.coverUrl,
    avatarUrl: space.avatarUrl,
    rules: space.rules,
    announcement: space.announcement,
    counts: {
      members: space._count.members,
      posts: space._count.posts,
    },
    viewer: {
      isMember: !!membership,
      role: membership ? (membership.role as SpaceRole) : null,
    },
    createdAt: space.createdAt.toISOString(),
  };
}

/** Map of spaceId → viewer's role across every space they belong to. */
export async function getViewerMemberships(viewerId: string) {
  const rows = await db.spaceMember.findMany({
    where: { userId: viewerId },
    select: { spaceId: true, role: true },
  });
  return new Map(rows.map((r) => [r.spaceId, { role: r.role }]));
}

export function mapSpaceMember(
  member: Prisma.SpaceMemberGetPayload<{
    include: { user: { include: { profile: true } } };
  }>,
  viewerId: string | null,
  followingSet: Set<string>,
  followerSet: Set<string>,
): SpaceMemberDTO {
  return {
    role: member.role as SpaceRole,
    joinedAt: member.createdAt.toISOString(),
    profile: member.user.profile
      ? mapProfileCard(member.user.profile, viewerId, followingSet, followerSet)
      : ({
          id: "", userId: "", username: "unknown", fullName: "Unknown",
          avatarUrl: null, bio: "", isPrivate: false, mood: "",
          viewer: { isSelf: false, isFollowing: false, isRequested: false, followsViewer: false },
        } as ProfileCardDTO),
  };
}

/** "Ember Café!" → "ember-cafe" (lowercase, dashes, trimmed to 40 chars). */
export function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
  return base || "space";
}

/** Returns `base`, or `base-2`, `base-3`… on collision. */
export async function uniqueSlug(base: string): Promise<string> {
  const taken = await db.space.findMany({
    where: { slug: { startsWith: base } },
    select: { slug: true },
  });
  const set = new Set(taken.map((t) => t.slug));
  if (!set.has(base)) return base;
  let n = 2;
  while (set.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

/** Finds a space by slug or throws NOT_FOUND. */
export async function requireSpace(slug: string) {
  const space = await db.space.findUnique({
    where: { slug },
    include: { _count: { select: { members: true, posts: true } } },
  });
  if (!space) {
    throw new HttpError("NOT_FOUND", "That space doesn't exist (anymore).");
  }
  return space;
}
