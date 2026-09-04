import { z } from "zod";
import { ok, parseBody, requireUser, route } from "@/lib/api-helpers";
import { db } from "@/lib/db";

const readSchema = z
  .object({
    ids: z.array(z.string().min(1).max(50)).max(200).optional(),
    all: z.boolean().optional(),
  })
  .strict();

/**
 * POST /api/notifications/read  body: { ids?: string[], all?: boolean }
 * Marks the given notifications (must belong to the viewer) or ALL of the
 * viewer's notifications read. → { unreadCount }
 */
export const POST = route(async ({ req, user }) => {
  const authed = requireUser(user);
  const body = await parseBody(req, readSchema);

  if (body.all) {
    await db.notification.updateMany({
      where: { userId: authed.id, readAt: null },
      data: { readAt: new Date() },
    });
  } else if (body.ids && body.ids.length > 0) {
    await db.notification.updateMany({
      where: { userId: authed.id, id: { in: body.ids }, readAt: null },
      data: { readAt: new Date() },
    });
  }

  const unreadCount = await db.notification.count({
    where: { userId: authed.id, readAt: null },
  });
  return ok({ unreadCount });
});
