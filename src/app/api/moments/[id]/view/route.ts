import { db } from "@/lib/db";
import { ok, requireUser, route } from "@/lib/api-helpers";
import { requireVisibleMoment } from "@/features/moments/server/moment-mapper";

// POST /api/moments/:id/view → { ok: true } — records a MomentView (upsert).
export const POST = route<{ id: string }>(async ({ params, user }) => {
  const authed = requireUser(user);
  const moment = await requireVisibleMoment(params.id, authed.id);
  await db.momentView.upsert({
    where: {
      momentId_userId: { momentId: moment.id, userId: authed.id },
    },
    update: {},
    create: { momentId: moment.id, userId: authed.id },
  });
  return ok({ ok: true });
});
