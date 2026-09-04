import { db } from "@/lib/db";
import { ok, parseBody, requireUser, route } from "@/lib/api-helpers";
import { reactionSchema } from "@/lib/validation";
import { notify } from "@/lib/notify";
import { requireVisibleMoment } from "@/features/moments/server/moment-mapper";
import type { ReactionType } from "@/types";

// POST /api/moments/:id/reactions → { reactionCount, viewerReaction } — toggle.
export const POST = route<{ id: string }>(async ({ params, req, user }) => {
  const authed = requireUser(user);
  const moment = await requireVisibleMoment(params.id, authed.id);
  const input = await parseBody(req, reactionSchema);

  const key = { momentId_userId: { momentId: moment.id, userId: authed.id } };
  const existing = await db.momentReaction.findUnique({ where: key });

  let viewerReaction: ReactionType | null;
  let created = false;

  if (existing && existing.type === input.type) {
    // Same reaction → remove (toggle off).
    await db.momentReaction.delete({ where: { id: existing.id } });
    viewerReaction = null;
  } else if (existing) {
    // Different reaction → switch type.
    await db.momentReaction.update({ where: { id: existing.id }, data: { type: input.type } });
    viewerReaction = input.type;
  } else {
    await db.momentReaction.create({
      data: { momentId: moment.id, userId: authed.id, type: input.type },
    });
    viewerReaction = input.type;
    created = true;
  }

  if (created) {
    // Notify the author once per fresh reaction (no spam on switches/removals).
    void notify({
      userId: moment.authorId,
      actorId: authed.id,
      type: "reaction",
      preview: "reacted to your moment",
    });
  }

  const reactionCount = await db.momentReaction.count({ where: { momentId: moment.id } });
  return ok({ reactionCount, viewerReaction });
});
