import { db } from "@/lib/db";
import { ok, parseBody, requireUser, route } from "@/lib/api-helpers";
import { createCollectionSchema } from "@/lib/validation";
import { collectionPreviewInclude, toCollectionDTO } from "./_shared";

/**
 * GET /api/collections → CollectionDTO[] — the viewer's collections
 * with postCount + cover preview urls.
 */
export const GET = route(async ({ user }) => {
  const viewer = requireUser(user);

  const rows = await db.collection.findMany({
    where: { userId: viewer.id },
    orderBy: { createdAt: "desc" },
    include: collectionPreviewInclude,
  });

  return ok(rows.map(toCollectionDTO));
});

/**
 * POST /api/collections { name } → CollectionDTO
 */
export const POST = route(async ({ req, user }) => {
  const viewer = requireUser(user);
  const body = await parseBody(req, createCollectionSchema);

  const collection = await db.collection.create({
    data: { userId: viewer.id, name: body.name },
    include: collectionPreviewInclude,
  });

  return ok(toCollectionDTO(collection));
});
