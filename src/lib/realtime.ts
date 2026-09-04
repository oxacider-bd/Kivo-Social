"use client";

import { useEffect, useRef } from "react";
import type { Socket } from "socket.io-client";
import { useSession } from "@/lib/session-store";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase";
import type { NotificationDTO, NotificationType } from "@/types";

/**
 * Strategic realtime — exactly one active transport per authenticated tab.
 *
 * Production (Supabase identity): a Supabase Realtime `postgres_changes`
 * subscription on `public.notifications`, filtered to the signed-in user's
 * `recipient_id`. It subscribes only while the user is authenticated, removes
 * the channel on unmount/logout, and re-subscribes only when the identity
 * itself changes — navigation and re-renders never create duplicate listeners.
 *
 * Local dev fallback (NEXT_PUBLIC_REALTIME_SOCKET=1): the socket.io service
 * used by legacy local-only accounts (e.g. the seeded demo user). It is
 * skipped whenever a Supabase identity is present to avoid double delivery,
 * and the socket.io-client code is dynamically imported so production bundles
 * never ship it.
 */
export function useRealtimeNotifications(onNotification: (n: NotificationDTO) => void) {
  const status = useSession((s) => s.status);
  const authId = useSession((s) => s.authId);
  const handlerRef = useRef(onNotification);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    handlerRef.current = onNotification;
  });

  // ── Transport A: Supabase Realtime (production) ────────────────────────────
  useEffect(() => {
    if (status !== "authenticated" || !authId || !isSupabaseConfigured()) return;

    const supabase = getSupabaseBrowserClient();
    const channel = supabase
      .channel(`kivo:notifications:${authId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `recipient_id=eq.${authId}`,
        },
        (payload) => {
          const row = (payload.new ?? {}) as Record<string, unknown>;
          handlerRef.current(mapRealtimeRow(row));
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [status, authId]);

  // ── Transport B: local socket fallback (dev / legacy demo account) ─────────
  useEffect(() => {
    if (process.env.NEXT_PUBLIC_REALTIME_SOCKET !== "1") return;
    if (status !== "authenticated" || authId) return; // Supabase transport owns delivery

    let cancelled = false;
    void import("socket.io-client").then(({ io }) => {
      if (cancelled) return;
      const socket = io("/?XTransformPort=3003", {
        path: "/",
        transports: ["websocket", "polling"],
        reconnectionDelay: 2000,
        reconnectionDelayMax: 10000,
      });
      socketRef.current = socket;
      socket.on("notification", (payload: NotificationDTO) => {
        handlerRef.current(payload);
      });
    });

    return () => {
      cancelled = true;
      socketRef.current?.disconnect();
      socketRef.current = null;
    };
  }, [status, authId]);

  return socketRef;
}

// ─── Supabase row → NotificationDTO ──────────────────────────────────────────

const NOTIFICATION_TYPES: ReadonlySet<string> = new Set([
  "reaction",
  "comment",
  "reply",
  "follow",
  "follow_request",
  "follow_accept",
  "mention",
  "space_post",
]);

/**
 * Maps a `public.notifications` row to the app DTO. The realtime row is a
 * delivery signal — `actor` is resolved moments later by the notifications
 * query refetch it triggers (single source of truth stays the app API).
 */
function mapRealtimeRow(row: Record<string, unknown>): NotificationDTO {
  const type = NOTIFICATION_TYPES.has(String(row.type))
    ? (row.type as NotificationType)
    : "mention";
  const str = (v: unknown): string | null =>
    typeof v === "string" && v.length > 0 ? v : null;
  return {
    id: str(row.id) ?? `rt-${Date.now()}`,
    type,
    actor: null,
    postId: str(row.post_id),
    commentId: str(row.comment_id),
    spaceId: str(row.space_id),
    spaceName: null,
    postPreview: null,
    preview: str(row.message),
    readAt: row.is_read ? new Date().toISOString() : null,
    createdAt: str(row.created_at) ?? new Date().toISOString(),
  };
}
