import { ok, requireUser, route } from "@/lib/api-helpers";
import { getGlobalUnreadCount } from "@/features/notifications/server/notifications-service";

/** GET /api/notifications/unread-count → { count } (cheap global count). */
export const GET = route(async ({ user }) => {
  const authed = requireUser(user);
  return ok({ count: await getGlobalUnreadCount(authed.id) });
});
