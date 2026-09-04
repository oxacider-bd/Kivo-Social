import { z } from "zod";
import { HttpError, ok, parseBody, requireUser, route } from "@/lib/api-helpers";
import { db } from "@/lib/db";
import { commentInclude, mapComment } from "@/services/posts-service";

/** mapComment's structural type keeps full reply rows; commentInclude selects ids only. */
type MappableComment = Parameters<typeof mapComment>[0];

const updateCommentSchema = z.object({
  content: z
    .string()
    .trim()
    .min(1, "Write something first.")
    .max(2000, "Comments are limited to 2,000 characters."),
});

// ─── PATCH /api/comments/:id → CommentDTO (author only) ─────────────────────

export const PATCH = route<{ id: string }>(async ({ req, user, params }) => {
  const authed = requireUser(user);
  const body = await parseBody(req, updateCommentSchema);

  const existing = await db.comment.findUnique({
    where: { id: params.id },
    select: { id: true, authorId: true, deletedAt: true },
  });
  if (!existing || existing.deletedAt) throw new HttpError("NOT_FOUND");
  if (existing.authorId !== authed.id) {
    throw new HttpError("FORBIDDEN", "Only the author can edit this comment.");
  }

  const updated = await db.comment.update({
    where: { id: params.id },
    data: { content: body.content },
    include: commentInclude,
  });
  return ok(mapComment(updated as MappableComment, authed.id));
});

// ─── DELETE /api/comments/:id → { deleted: true } (author only) ─────────────
// With replies: soft-delete (content cleared, row stays as thread anchor).
// Without replies: hard delete.

export const DELETE = route<{ id: string }>(async ({ user, params }) => {
  const authed = requireUser(user);

  const existing = await db.comment.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      authorId: true,
      deletedAt: true,
      replies: { where: { deletedAt: null }, select: { id: true } },
    },
  });
  if (!existing || existing.deletedAt) throw new HttpError("NOT_FOUND");
  if (existing.authorId !== authed.id) {
    throw new HttpError("FORBIDDEN", "Only the author can delete this comment.");
  }

  if (existing.replies.length > 0) {
    await db.comment.update({
      where: { id: params.id },
      data: { deletedAt: new Date(), content: "" },
    });
  } else {
    await db.comment.delete({ where: { id: params.id } });
  }
  return ok({ deleted: true });
});
