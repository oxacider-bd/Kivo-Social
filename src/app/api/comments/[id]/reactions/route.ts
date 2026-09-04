import { ok, parseBody, requireUser, route } from "@/lib/api-helpers";
import { db } from "@/lib/db";
import { reactionSchema } from "@/lib/validation";
import type { CommentReactionSummary, ReactionType } from "@/types";

/**
 * POST /api/comments/:id/reactions { type } → { summary: CommentReactionSummary[] }
 * Toggle semantics: same type removes, a different type switches, none creates.
 */
export const POST = route<{ id: string }>(async ({ req, user, params }) => {
  const authed = requireUser(user);
  const body = await parseBody(req, reactionSchema);

  const existing = await db.commentReaction.findUnique({
    where: { userId_commentId: { userId: authed.id, commentId: params.id } },
  });

  if (existing && existing.type === body.type) {
    await db.commentReaction.delete({ where: { id: existing.id } });
  } else if (existing) {
    await db.commentReaction.update({
      where: { id: existing.id },
      data: { type: body.type },
    });
  } else {
    await db.commentReaction.create({
      data: { userId: authed.id, commentId: params.id, type: body.type },
    });
  }

  const viewerReaction: ReactionType | null =
    existing?.type === body.type ? null : body.type;

  const grouped = await db.commentReaction.groupBy({
    by: ["type"],
    where: { commentId: params.id },
    _count: { type: true },
  });

  const summary: CommentReactionSummary[] = grouped
    .map((g) => ({
      type: g.type as ReactionType,
      count: g._count.type,
      viewerReacted: g.type === viewerReaction,
    }))
    .sort((a, b) => b.count - a.count);

  return ok({ summary });
});
