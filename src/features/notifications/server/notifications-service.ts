import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { encodeCursor } from "@/lib/api-helpers";
import { buildFollowSets, mapProfileCard } from "@/services/posts-service";
import type { NotificationType, Page } from "@/types";
import type { EnrichedNotification, NotificationFilter } from "../types";

// ─── Filter → type sets ──────────────────────────────────────────────────────

const SOCIAL_TYPES: NotificationType[] = [
  "reaction",
  "comment",
  "reply",
  "follow",
  "follow_accept",
  "follow_request",
  "space_post",
];
const MENTION_TYPES: NotificationType[] = ["mention"];

export function typesForFilter(filter: NotificationFilter): NotificationType[] | null {
  if (filter === "social") return SOCIAL_TYPES;
  if (filter === "mentions") return MENTION_TYPES;
  return null; // all
}

// ─── Row shape ───────────────────────────────────────────────────────────────

interface NotificationRow {
  id: string;
  actorId: string | null;
  type: string;
  postId: string | null;
  commentId: string | null;
  spaceId: string | null;
  preview: string | null;
  readAt: Date | null;
  createdAt: Date;
  actor: {
    profile: {
      id: string;
      userId: string;
      username: string;
      fullName: string;
      bio: string;
      avatarUrl: string | null;
      isPrivate: boolean;
      mood: string;
    };
  } | null;
  // Written by notify(); absent on DB snapshots pushed before these columns existed.
  spaceName?: string | null;
  postPreview?: string | null;
}

/**
 * `notify()` stores `spaceName`/`postPreview` on every notification row, but some
 * pushed schema snapshots may not have those columns yet. Probe once per process
 * so reads keep working either way (graceful degradation to null instead of 500s).
 */
let previewColumnsAvailable: boolean | null = null;

async function previewColumnsReady(): Promise<boolean> {
  if (previewColumnsAvailable !== null) return previewColumnsAvailable;
  try {
    await db.notification.findFirst({
      where: { id: "__kivo_probe__" },
      select: { spaceName: true, postPreview: true },
    } as unknown as Prisma.NotificationFindFirstArgs);
    previewColumnsAvailable = true;
  } catch {
    previewColumnsAvailable = false;
  }
  return previewColumnsAvailable;
}

const BASE_SELECT = {
  id: true,
  actorId: true,
  type: true,
  postId: true,
  commentId: true,
  spaceId: true,
  preview: true,
  readAt: true,
  createdAt: true,
  actor: { select: { profile: true } },
} as const;

async function buildSelect(): Promise<typeof BASE_SELECT> {
  if (await previewColumnsReady()) {
    return { ...BASE_SELECT, spaceName: true, postPreview: true } as unknown as typeof BASE_SELECT;
  }
  return BASE_SELECT;
}

// ─── Mapping ─────────────────────────────────────────────────────────────────

function mapNotification(
  row: NotificationRow,
  viewerId: string,
  followingSet: Set<string>,
  followerSet: Set<string>,
  followRequestId: string | null,
): EnrichedNotification {
  return {
    id: row.id,
    type: row.type as NotificationType,
    actor: row.actor
      ? mapProfileCard(row.actor.profile, viewerId, followingSet, followerSet)
      : null,
    postId: row.postId,
    commentId: row.commentId,
    spaceId: row.spaceId,
    spaceName: row.spaceName ?? null,
    postPreview: row.postPreview ?? null,
    preview: row.preview,
    readAt: row.readAt ? row.readAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    followRequestId,
  };
}

// ─── Queries ─────────────────────────────────────────────────────────────────

/** GLOBAL unread count for the viewer (never filter-scoped). */
export async function getGlobalUnreadCount(viewerId: string): Promise<number> {
  return db.notification.count({ where: { userId: viewerId, readAt: null } });
}

/**
 * Viewer's notifications, newest first (keyset pagination on createdAt+id).
 * Returns a `Page` of enriched DTOs with accurate actor viewer-flags and, for
 * follow_request rows, the id of the actor's still-pending request (null once
 * handled — the UI uses it to wire inline Accept / Decline).
 */
export async function listNotifications(
  viewerId: string,
  filter: NotificationFilter,
  cursor: { createdAt: Date; id: string } | null,
  limit: number,
): Promise<Page<EnrichedNotification>> {
  const typeIn = typesForFilter(filter);
  const where: Prisma.NotificationWhereInput = {
    userId: viewerId,
    ...(typeIn ? { type: { in: typeIn } } : {}),
    ...(cursor
      ? {
          OR: [
            { createdAt: { lt: cursor.createdAt } },
            { createdAt: cursor.createdAt, id: { lt: cursor.id } },
          ],
        }
      : {}),
  };

  const [rows, { followingSet, followerSet }] = await Promise.all([
    db.notification.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
      select: (await buildSelect()) as unknown as Prisma.NotificationSelect,
    }),
    buildFollowSets(viewerId),
  ]);

  const typedRows = rows as unknown as NotificationRow[];
  const hasMore = typedRows.length > limit;
  const pageRows = hasMore ? typedRows.slice(0, limit) : typedRows;
  const last = pageRows[pageRows.length - 1];

  // Resolve pending follow-request ids for follow_request rows in one query.
  const requesterIds = pageRows
    .filter((r) => r.type === "follow_request" && r.actorId)
    .map((r) => r.actorId as string);
  const pendingByRequester = new Map<string, string>();
  if (requesterIds.length > 0) {
    const pending = await db.followRequest.findMany({
      where: { targetId: viewerId, requesterId: { in: requesterIds }, status: "PENDING" },
      select: { id: true, requesterId: true },
    });
    for (const req of pending) pendingByRequester.set(req.requesterId, req.id);
  }

  const items = pageRows.map((row) =>
    mapNotification(
      row,
      viewerId,
      followingSet,
      followerSet,
      row.type === "follow_request"
        ? (pendingByRequester.get(row.actorId ?? "") ?? null)
        : null,
    ),
  );

  return {
    items,
    nextCursor: hasMore && last ? encodeCursor(last.createdAt, last.id) : null,
  };
}
