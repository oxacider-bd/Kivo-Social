"use client";
/* eslint-disable react-hooks/refs -- useInfiniteList returns sentinelRef mixed with plain react-query state; reads below are query state, and sentinelRef is only ever attached to a DOM node (its documented contract). */

import { useCallback, useEffect, useState, type ReactNode, type RefObject } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AtSign, Bell, CheckCheck, Heart, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useInfiniteList } from "@/hooks/use-infinite";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState, ErrorState } from "@/components/empty-state";
import { useUi } from "@/lib/ui-store";
import {
  KIVO_NOTIFICATION_EVENT,
  NOTIFICATIONS_ROOT_KEY,
  UNREAD_COUNT_KEY,
  fetchNotificationsPage,
  fetchUnreadCount,
  markAllNotificationsRead,
} from "../lib/notifications-client";
import { NotificationItem, NotificationListSkeleton } from "../components/notification-item";
import type { EnrichedNotification, NotificationFilter } from "../types";

// ─── Realtime freshness ──────────────────────────────────────────────────────
// Contract: the app shell (lead) dispatches `kivo:notification` CustomEvents on
// window whenever a realtime notification arrives (detail: NotificationDTO).
// We only invalidate cached notification queries — toasts/badges are the
// shell's job. See worklog task 2-e for the full event contract.

function useRealtimeNotificationInvalidation() {
  const queryClient = useQueryClient();
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onNotification = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        void queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_ROOT_KEY });
      }, 250);
    };
    window.addEventListener(KIVO_NOTIFICATION_EVENT, onNotification);
    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener(KIVO_NOTIFICATION_EVENT, onNotification);
    };
  }, [queryClient]);
}

// ─── Single filter list ──────────────────────────────────────────────────────

/** Sentinel div kept in its own component so the parent render stays ref-free. */
function NotificationList({
  filter,
  empty,
}: {
  filter: NotificationFilter;
  empty: { icon: ReactNode; title: string; description?: string };
}) {
  const queryClient = useQueryClient();
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(() => new Set<string>());

  const list = useInfiniteList<EnrichedNotification>(
    ["notifications", filter],
    (cursor, signal) => fetchNotificationsPage(filter, cursor, signal, queryClient),
  );

  const dismiss = useCallback((id: string, restore = false) => {
    setDismissed((prev) => {
      const next = new Set(prev);
      if (restore) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  if (list.isLoading) return <NotificationListSkeleton />;

  if (list.isError) {
    return (
      <ErrorState
        title="Notifications couldn't load"
        description="Check your connection and try again."
        action={
          <Button variant="outline" size="sm" onClick={() => void list.refetch()}>
            Try again
          </Button>
        }
      />
    );
  }

  const items = list.items.filter((n) => !dismissed.has(n.id));

  if (items.length === 0) {
    return (
      <EmptyState
        icon={empty.icon}
        title={empty.title}
        description={empty.description}
        className="border-border/70"
      />
    );
  }

  return (
    <div>
      <div className="overflow-hidden rounded-2xl border bg-card card-shadow">
        <ul className="divide-y">
          {items.map((n) => (
            <li key={n.id}>
              <NotificationItem notification={n} onDismiss={dismiss} />
            </li>
          ))}
        </ul>
        {list.isFetchingNextPage && (
          <div className="flex items-center justify-center border-t py-3" aria-busy="true">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-hidden />
          </div>
        )}
      </div>
      <div ref={list.sentinelRef} aria-hidden="true" />
      {!list.hasNextPage && items.length > 3 && (
        <p className="py-4 text-center text-xs text-muted-foreground">That&apos;s everything.</p>
      )}
    </div>
  );
}

// ─── View ────────────────────────────────────────────────────────────────────

const TAB_EMPTY: Record<NotificationFilter, { icon: ReactNode; title: string; description?: string }> = {
  all: {
    icon: <Bell className="h-8 w-8" aria-hidden />,
    title: "You're all caught up.",
    description: "New reactions, comments and follows will show up here.",
  },
  social: {
    icon: <Heart className="h-8 w-8" aria-hidden />,
    title: "No social activity yet.",
    description: "Reactions, comments, replies and follows land here.",
  },
  mentions: {
    icon: <AtSign className="h-8 w-8" aria-hidden />,
    title: "No mentions yet — they'll show up here.",
    description: "When someone @-mentions you in a post or comment, you'll see it here.",
  },
};

export default function NotificationsView() {
  const queryClient = useQueryClient();
  const setGlobalUnread = useUi((s) => s.setUnreadNotifications);
  const [markingAll, setMarkingAll] = useState(false);
  useRealtimeNotificationInvalidation();

  const unreadQuery = useQuery({
    queryKey: UNREAD_COUNT_KEY,
    queryFn: ({ signal }) => fetchUnreadCount(signal),
  });
  const unreadCount = unreadQuery.data ?? 0;

  // Keep the shell's global unread badge in sync with the authoritative count.
  useEffect(() => {
    if (typeof unreadQuery.data === "number") setGlobalUnread(unreadQuery.data);
  }, [unreadQuery.data, setGlobalUnread]);

  const handleMarkAll = useCallback(async () => {
    setMarkingAll(true);
    try {
      await markAllNotificationsRead(queryClient);
      toast.success("All caught up.");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Couldn't mark everything read. Please try again.",
      );
    } finally {
      setMarkingAll(false);
    }
  }, [queryClient]);

  return (
    <section aria-label="Notifications" className="flex flex-1 flex-col">
      <header className="mb-4 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">Notifications</h1>
        <Button
          variant="ghost"
          size="sm"
          className="gap-2 text-muted-foreground transition-colors hover:text-foreground"
          onClick={() => void handleMarkAll()}
          disabled={markingAll || unreadCount === 0 || unreadQuery.isLoading}
          aria-label="Mark all notifications as read"
        >
          {markingAll ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <CheckCheck className="h-4 w-4 text-brand" aria-hidden />
          )}
          <span className="hidden sm:inline">Mark all read</span>
          <span className="sm:hidden">Read all</span>
        </Button>
      </header>

      <Tabs defaultValue="all" className="flex flex-1 flex-col">
        <TabsList aria-label="Notification filters" className="mb-3 grid h-auto w-full grid-cols-3 gap-4 rounded-none border-b bg-transparent p-0">
          <TabsTrigger
            value="all"
            className="h-auto rounded-none border-0 border-b-2 border-transparent bg-transparent px-1 pb-2.5 pt-1 text-sm font-medium text-muted-foreground shadow-none transition-colors duration-150 hover:text-foreground data-[state=active]:border-brand data-[state=active]:bg-transparent data-[state=active]:font-semibold data-[state=active]:text-foreground data-[state=active]:shadow-none dark:data-[state=active]:border-brand dark:data-[state=active]:bg-transparent"
          >
            All
          </TabsTrigger>
          <TabsTrigger
            value="social"
            className="h-auto rounded-none border-0 border-b-2 border-transparent bg-transparent px-1 pb-2.5 pt-1 text-sm font-medium text-muted-foreground shadow-none transition-colors duration-150 hover:text-foreground data-[state=active]:border-brand data-[state=active]:bg-transparent data-[state=active]:font-semibold data-[state=active]:text-foreground data-[state=active]:shadow-none dark:data-[state=active]:border-brand dark:data-[state=active]:bg-transparent"
          >
            Social
          </TabsTrigger>
          <TabsTrigger
            value="mentions"
            className="h-auto rounded-none border-0 border-b-2 border-transparent bg-transparent px-1 pb-2.5 pt-1 text-sm font-medium text-muted-foreground shadow-none transition-colors duration-150 hover:text-foreground data-[state=active]:border-brand data-[state=active]:bg-transparent data-[state=active]:font-semibold data-[state=active]:text-foreground data-[state=active]:shadow-none dark:data-[state=active]:border-brand dark:data-[state=active]:bg-transparent"
          >
            Mentions
          </TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="mt-0">
          <NotificationList filter="all" empty={TAB_EMPTY.all} />
        </TabsContent>
        <TabsContent value="social" className="mt-0">
          <NotificationList filter="social" empty={TAB_EMPTY.social} />
        </TabsContent>
        <TabsContent value="mentions" className="mt-0">
          <NotificationList filter="mentions" empty={TAB_EMPTY.mentions} />
        </TabsContent>
      </Tabs>
    </section>
  );
}
