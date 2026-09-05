"use client";

import { api } from "@/lib/api";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import { useSession } from "@/lib/session-store";
import type { QueryClient } from "@tanstack/react-query";
import type { Page } from "@/types";
import type { EnrichedNotification, NotificationFilter, NotificationsPayload } from "../types";

// ─── Query keys ──────────────────────────────────────────────────────────────

/**
 * Window event contract (dispatched by the app shell / lead, consumed here):
 * `window.dispatchEvent(new CustomEvent("kivo:notification", { detail: NotificationDTO }))`
 * — fired whenever a realtime `notification` arrives on the socket. We only use it
 * to invalidate cached queries; toasts and badges stay the shell's responsibility.
 */
export const KIVO_NOTIFICATION_EVENT = "kivo:notification";

/** Root prefix shared by every notifications list query (["notifications", filter]). */
export const NOTIFICATIONS_ROOT_KEY = ["notifications"] as const;
/** Unread counter query (kept under the root prefix so one invalidate covers all). */
export const UNREAD_COUNT_KEY = ["notifications", "unread-count"] as const;

export const NOTIFICATIONS_PAGE_SIZE = 20;

// ─── Fetching ────────────────────────────────────────────────────────────────

/** Fetches one page for a filter and syncs the global unread counter cache. */
export async function fetchNotificationsPage(
  filter: NotificationFilter,
  cursor: string | null,
  signal: AbortSignal,
  queryClient: QueryClient,
): Promise<Page<EnrichedNotification>> {
  const params = new URLSearchParams({ filter, limit: String(NOTIFICATIONS_PAGE_SIZE) });
  if (cursor) params.set("cursor", cursor);
  const payload = await api<NotificationsPayload>(
    `/api/notifications?${params.toString()}`,
    { signal },
  );
  queryClient.setQueryData<number>(UNREAD_COUNT_KEY, payload.unreadCount);
  return payload.page;
}

export async function fetchUnreadCount(signal?: AbortSignal): Promise<number> {
  const data = await api<{ count: number }>("/api/notifications/unread-count", { signal });
  return data.count;
}

// ─── Supabase read-state sync ────────────────────────────────────────────────

/**
 * Best-effort: mirror read-state into Supabase `public.notifications` — the
 * durable per-action record (ref_id = the app notification id). The app API
 * stays authoritative for the UI; this keeps the Supabase rows consistent for
 * cross-device reads and future consumers (e.g. OneSignal). Never throws.
 */
function syncReadStateToSupabase(ids: string[] | null): void {
  try {
    const authId = useSession.getState().authId;
    if (!authId) return; // legacy local account — no Supabase rows exist
    const update = getSupabaseBrowserClient()
      .from("notifications")
      .update({ is_read: true })
      .eq("recipient_id", authId);
    const query = ids ? update.in("ref_id", ids) : update.eq("is_read", false);
    void query.then(
      () => undefined,
      () => undefined,
    );
  } catch {
    /* best-effort */
  }
}

// ─── Cache patching (optimistic read state) ──────────────────────────────────

interface InfinitePages {
  pages: { items?: EnrichedNotification[]; nextCursor?: string | null }[];
}

function isInfinitePages(data: unknown): data is InfinitePages {
  return (
    typeof data === "object" &&
    data !== null &&
    "pages" in data &&
    Array.isArray((data as InfinitePages).pages)
  );
}

/** Sets readAt on the given ids (or all when idSet is null) across every list cache. */
function patchReadCaches(queryClient: QueryClient, idSet: Set<string> | null, readAt: string) {
  queryClient.setQueriesData<unknown>({ queryKey: NOTIFICATIONS_ROOT_KEY }, (data) => {
    if (!isInfinitePages(data)) return data;
    let anyChanged = false;
    const pages = data.pages.map((page) => {
      if (!page || !Array.isArray(page.items)) return page;
      let pageChanged = false;
      const items = page.items.map((n) => {
        const matches = idSet === null ? true : idSet.has(n.id);
        if (matches && !n.readAt) {
          pageChanged = true;
          return { ...n, readAt };
        }
        return n;
      });
      if (!pageChanged) return page;
      anyChanged = true;
      return { ...page, items };
    });
    return anyChanged ? { ...data, pages } : data;
  });
}

/** Unique unread ids currently present in any cached page (for optimistic decrement). */
function countUnreadCached(snapshot: [readonly unknown[], unknown][], idSet: Set<string>): number {
  const found = new Set<string>();
  for (const [, data] of snapshot) {
    if (!isInfinitePages(data)) continue;
    for (const page of data.pages) {
      for (const n of page.items ?? []) {
        if (idSet.has(n.id) && !n.readAt) found.add(n.id);
      }
    }
  }
  return found.size;
}

function restoreSnapshot(
  queryClient: QueryClient,
  snapshot: [readonly unknown[], unknown][],
) {
  for (const [key, data] of snapshot) {
    queryClient.setQueryData(key, data);
  }
}

/**
 * Optimistically marks the given notifications read in every cache, then makes
 * the server call authoritative. Restores caches when the call fails.
 */
export async function markNotificationsRead(queryClient: QueryClient, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const idSet = new Set(ids);
  const snapshot = queryClient.getQueriesData<unknown>({ queryKey: NOTIFICATIONS_ROOT_KEY });
  const prevUnread = queryClient.getQueryData<number>(UNREAD_COUNT_KEY);
  const readAt = new Date().toISOString();

  patchReadCaches(queryClient, idSet, readAt);
  if (typeof prevUnread === "number") {
    queryClient.setQueryData<number>(
      UNREAD_COUNT_KEY,
      Math.max(0, prevUnread - countUnreadCached(snapshot, idSet)),
    );
  }

  try {
    const { unreadCount } = await api<{ unreadCount: number }>("/api/notifications/read", {
      method: "POST",
      body: { ids },
    });
    queryClient.setQueryData<number>(UNREAD_COUNT_KEY, unreadCount);
    syncReadStateToSupabase(ids);
  } catch (err) {
    restoreSnapshot(queryClient, snapshot);
    if (typeof prevUnread === "number") {
      queryClient.setQueryData<number>(UNREAD_COUNT_KEY, prevUnread);
    }
    throw err;
  }
}

/** Marks everything read (optimistic + authoritative), same rollback guarantees. */
export async function markAllNotificationsRead(queryClient: QueryClient): Promise<void> {
  const snapshot = queryClient.getQueriesData<unknown>({ queryKey: NOTIFICATIONS_ROOT_KEY });
  const prevUnread = queryClient.getQueryData<number>(UNREAD_COUNT_KEY);
  const readAt = new Date().toISOString();

  patchReadCaches(queryClient, null, readAt);
  queryClient.setQueryData<number>(UNREAD_COUNT_KEY, 0);

  try {
    const { unreadCount } = await api<{ unreadCount: number }>("/api/notifications/read", {
      method: "POST",
      body: { all: true },
    });
    queryClient.setQueryData<number>(UNREAD_COUNT_KEY, unreadCount);
    syncReadStateToSupabase(null);
  } catch (err) {
    restoreSnapshot(queryClient, snapshot);
    if (typeof prevUnread === "number") {
      queryClient.setQueryData<number>(UNREAD_COUNT_KEY, prevUnread);
    }
    throw err;
  }
}
