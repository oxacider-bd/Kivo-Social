import { HttpError, getCursorFrom, getLimitFrom, ok, requireUser, route } from "@/lib/api-helpers";
import { getGlobalUnreadCount, listNotifications } from "@/features/notifications/server/notifications-service";
import type { NotificationFilter } from "@/features/notifications/types";

const FILTERS: readonly string[] = ["all", "social", "mentions"];

/**
 * GET /api/notifications?filter=all|social|mentions&cursor&limit
 * → { page: Page<NotificationDTO>, unreadCount: number }
 * `unreadCount` is the viewer's GLOBAL unread count (never filter-scoped).
 */
export const GET = route(async ({ req, user }) => {
  const authed = requireUser(user);

  const filterParam = req.nextUrl.searchParams.get("filter") ?? "all";
  if (!FILTERS.includes(filterParam)) {
    throw new HttpError("VALIDATION", "Unknown notifications filter.");
  }
  const filter = filterParam as NotificationFilter;

  const cursor = getCursorFrom(req);
  const limit = getLimitFrom(req, 10, 30);

  const [page, unreadCount] = await Promise.all([
    listNotifications(authed.id, filter, cursor, limit),
    getGlobalUnreadCount(authed.id),
  ]);

  return ok({ page, unreadCount });
});
