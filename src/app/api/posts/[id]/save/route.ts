import { z } from "zod";
import {
  HttpError,
  ok,
  parseBody,
  requireUser,
  route,
} from "@/lib/api-helpers";
import { db } from "@/lib/db";
import { requireVisiblePost } from "@/features/posts/server/post-guard";

const saveSchema = z
  .object({
    collectionId: z.string().max(50).nullable().optional(),
    collectionName: z.string().trim().min(1, "Give the collection a name.").max(60).optional(),
  })
  .refine((v) => !v.collectionName || !v.collectionId, {
    message: "Choose a collection or name a new one — not both.",
  });

// ─── POST /api/posts/:id/save → { saved: true } ─────────────────────────────

export const POST = route<{ id: string }>(async ({ req, user, params }) => {
  const authed = requireUser(user);
  const body = await parseBody(req, saveSchema);
  await requireVisiblePost(params.id, authed.id);

  let collectionId: string | null = body.collectionId ?? null;

  if (body.collectionName) {
    const collection = await db.collection.create({
      data: { userId: authed.id, name: body.collectionName },
    });
    collectionId = collection.id;
  } else if (collectionId) {
    const owned = await db.collection.findFirst({
      where: { id: collectionId, userId: authed.id },
      select: { id: true },
    });
    if (!owned) throw new HttpError("NOT_FOUND", "That collection doesn't exist.");
  }

  await db.savedPost.upsert({
    where: { userId_postId: { userId: authed.id, postId: params.id } },
    update: { collectionId },
    create: { userId: authed.id, postId: params.id, collectionId },
  });

  return ok({ saved: true });
});

// ─── DELETE /api/posts/:id/save → { saved: false } ──────────────────────────

export const DELETE = route<{ id: string }>(async ({ user, params }) => {
  const authed = requireUser(user);
  await requireVisiblePost(params.id, authed.id);
  await db.savedPost.deleteMany({ where: { userId: authed.id, postId: params.id } });
  return ok({ saved: false });
});
