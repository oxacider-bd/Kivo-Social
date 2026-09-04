import type { NotificationDTO, Page } from "@/types";

/**
 * NotificationDTO plus KIVO extensions returned by GET /api/notifications.
 * - `followRequestId`: resolved id of the actor's PENDING follow request towards the
 *   viewer (null when the request is already handled or the actor has none). Lets the
 *   notifications UI offer inline Accept / Decline wired to agent 2-c's endpoints.
 */
export interface EnrichedNotification extends NotificationDTO {
  followRequestId?: string | null;
}

export type NotificationFilter = "all" | "social" | "mentions";

/** GET /api/notifications response body. */
export interface NotificationsPayload {
  page: Page<EnrichedNotification>;
  unreadCount: number;
}
