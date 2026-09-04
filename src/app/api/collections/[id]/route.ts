import { db } from "@/lib/db";
import {
  encodeCursor,
  getCursorFrom,
  getLimitFrom,
  HttpError,
  ok,
  parseBody,
  requireUser,
  route,
} from "@/lib/api-helpers";
import { createCollectionSchema } from "@/lib/validation";
import { mapPosts, postInclude } from "@/services/posts-service";
import { collectionPreviewInclude, toCollectionDTO } from "../_shared";

// ─── Ownership guard ─────────────────────────────────────────────────────────

async function getOwnedCollection(id: string, userId: string) {
  const collection = await db.collection.findUnique({ where: { id } });
  if (!collection) throw new HttpError("NOT_FOUND", "We couldn't find that collection.");
  if (collection.userId !== userId) throw new HttpError("FORBIDDEN");
  return collection;
}

/**
 * GET /api/collections/:id?cursor= → { collection: CollectionDTO, posts: Page<PostDTO> }
 * Owner only. Posts are the collection's saved posts, newest saved first.
 */
export const GET = route<{ id: string }>(async ({ req, user, params }) => {
  const viewer = requireUser(user);
  await getOwnedCollection(params.id, viewer.id);

  const cursor = getCursorFrom(req);
  const limit = getLimitFrom(req, 10, 30);
  const cursorWhere = cursor
    ? {
        OR: [
          { createdAt: { lt: cursor.createdAt } },
          { createdAt: cursor.createdAt, id: { lt: cursor.id } },
        ],
      }
    : {};

  const [fresh, rows] = await Promise.all([
    db.collection.findUnique({
      where: { id: params.id },
      include: collectionPreviewInclude,
    }),
    db.savedPost.findMany({
      where: { collectionId: params.id, ...cursorWhere },
      include: { post: { include: postInclude } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
    }),
  ]);
  if (!fresh) throw new HttpError("NOT_FOUND", "We couldn't find that collection.");

  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;
  const items = await mapPosts(
    pageRows.map((r) => r.post),
    viewer.id,
  );
  const last = pageRows[pageRows.length - 1];

  return ok({
    collection: toCollectionDTO(fresh),
    posts: {
      items,
      nextCursor: hasMore && last ? encodeCursor(last.createdAt, last.id) : null,
    },
  });
});

/**
 * PATCH /api/collections/:id { name } → CollectionDTO — owner only.
 */
export const PATCH = route<{ id: string }>(async ({ req, user, params }) => {
  const viewer = requireUser(user);
  await getOwnedCollection(params.id, viewer.id);
  const body = await parseBody(req, createCollectionSchema);

  const collection = await db.collection.update({
    where: { id: params.id },
    data: { name: body.name },
    include: collectionPreviewInclude,
  });

  return ok(toCollectionDTO(collection));
});

/**
 * DELETE /api/collections/:id → { deleted: true } — owner only.
 * SavedPost.collectionId is SetNull on delete (schema-configured).
 */
export const DELETE = route<{ id: string }>(async ({ user, params }) => {
  const viewer = requireUser(user);
  await getOwnedCollection(params.id, viewer.id);

  await db.collection.delete({ where: { id: params.id } });

  return ok({ deleted: true });
});
