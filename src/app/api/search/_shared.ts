import { Prisma } from "@prisma/client";
import type { SpaceDTO, SpaceRole } from "@/types";
import { encodeCursor } from "@/lib/api-helpers";

// ─── Shared helpers for search / explore endpoints ───────────────────────────

export interface Cursor {
  createdAt: Date;
  id: string;
}

/**
 * SQLite `contains` is case-sensitive — generate case variants to widen the
 * DB-side net; final matching is done in JS (lowercase includes).
 */
export function caseVariants(q: string): string[] {
  const lower = q.toLowerCase();
  const cap = lower.charAt(0).toUpperCase() + lower.slice(1);
  return lower === cap ? [lower] : [lower, cap];
}

export function matchesAny(haystacks: string[], qLower: string): boolean {
  return haystacks.some((h) => h.toLowerCase().includes(qLower));
}

/** Engagement score: reactions + 2×top-level comments. */
export function scorePost(post: {
  reactions: unknown[];
  comments: { parentId: string | null }[];
}): number {
  return post.reactions.length + 2 * post.comments.filter((c) => !c.parentId).length;
}

/**
 * Paginates a fully sorted in-memory candidate list with the shared
 * createdAt|id cursor. `cursor.id` locates the previous page's last item.
 */
export function pageFromCandidates<T extends { createdAt: Date; id: string }>(
  candidates: T[],
  cursor: Cursor | null,
  limit: number,
): { items: T[]; nextCursor: string | null } {
  let start = 0;
  if (cursor) {
    const idx = candidates.findIndex((c) => c.id === cursor.id);
    if (idx === -1) return { items: [], nextCursor: null };
    start = idx + 1;
  }
  const slice = candidates.slice(start, start + limit + 1);
  const hasMore = slice.length > limit;
  const items = hasMore ? slice.slice(0, limit) : slice;
  const last = items[items.length - 1];
  return {
    items,
    nextCursor: hasMore && last ? encodeCursor(last.createdAt, last.id) : null,
  };
}

/** WHERE chunk for keyset pagination on createdAt+id (newest first). */
export function cursorWhere(cursor: Cursor | null): Prisma.PostWhereInput {
  if (!cursor) return {};
  return {
    OR: [
      { createdAt: { lt: cursor.createdAt } },
      { createdAt: cursor.createdAt, id: { lt: cursor.id } },
    ],
  };
}

// ─── Space mapping (search results) ─────────────────────────────────────────

export const spaceSearchInclude = (viewerId: string) =>
  ({
    _count: { select: { members: true, posts: true } },
    members: { where: { userId: viewerId }, select: { role: true }, take: 1 },
  }) satisfies Prisma.SpaceInclude;

type SpaceSearchRow = Prisma.SpaceGetPayload<{
  include: {
    _count: { select: { members: true; posts: true } };
    members: { select: { role: true } };
  };
}>;

export function mapSpace(space: SpaceSearchRow): SpaceDTO {
  const membership = space.members[0];
  return {
    id: space.id,
    slug: space.slug,
    name: space.name,
    description: space.description,
    coverUrl: space.coverUrl,
    avatarUrl: space.avatarUrl,
    rules: space.rules,
    announcement: space.announcement,
    counts: { members: space._count.members, posts: space._count.posts },
    viewer: {
      isMember: !!membership,
      role: membership ? (membership.role as SpaceRole) : null,
    },
    createdAt: space.createdAt.toISOString(),
  };
}
