"use client";

import { useEffect, useRef } from "react";
import type { Socket } from "socket.io-client";
import { useSession } from "@/lib/session-store";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase";
import type { NotificationDTO, NotificationType, ProfileCardDTO } from "@/types";

/**
 * Strategic realtime — exactly one active transport per authenticated tab.
 *
 * Production (Supabase identity): a Supabase Realtime `postgres_changes`
 * subscription on `public.notifications`, filtered to the signed-in user's
 * `recipient_id` (server-side RLS additionally enforces ownership). It
 * subscribes only while the user is authenticated, removes the channel on
 * unmount/logout, and re-subscribes only when the identity itself changes —
 * navigation and re-renders never create duplicate listeners.
 *
 * Lifecycle: SUBSCRIBED resets the backoff; CHANNEL_ERROR / TIMED_OUT / CLOSED
 * schedule one reconnect with capped exponential backoff (1s → 30s) — never an
 * infinite tight loop, never polling.
 *
 * The arriving row carries `actor_id`; the actor's public Supabase profile is
 * fetched once per actor (cached, bounded) so toasts show a real name.
 * OneSignal prep: this handler is the single realtime ingestion point — a
 * future Web-Push integration can consume the same stream without touching
 * the database source of truth.
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
    const diagnostics = process.env.NODE_ENV !== "production";
    let channel = supabase.channel(`kivo:notifications:${authId}`);
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let retries = 0;
    let disposed = false;

    const scheduleReconnect = () => {
      if (disposed || retryTimer) return;
      const delay = Math.min(30_000, 1_000 * 2 ** retries);
      retries += 1;
      if (diagnostics) console.info("[kivo-rt] reconnect in", delay, "ms");
      retryTimer = setTimeout(() => {
        retryTimer = null;
        if (disposed) return;
        void supabase
          .removeChannel(channel)
          .catch(() => undefined)
          .finally(() => connect());
      }, delay);
    };

    const connect = () => {
      if (disposed) return;
      channel = supabase
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
            if (diagnostics) console.info("[kivo-rt] event:", String(row.type ?? "?"));
            void enrichAndMap(row).then((dto) => {
              if (dto) handlerRef.current(dto);
            });
          },
        )
        .subscribe((state) => {
          if (diagnostics) console.info("[kivo-rt] channel:", state);
          if (state === "SUBSCRIBED") {
            retries = 0;
          } else if (state === "CHANNEL_ERROR" || state === "TIMED_OUT" || state === "CLOSED") {
            scheduleReconnect();
          }
        });
    };

    connect();

    return () => {
      disposed = true;
      if (retryTimer) clearTimeout(retryTimer);
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

/** Supabase taxonomy → app taxonomy (the single mapping point). */
const SUPABASE_TYPE_TO_APP: Record<string, string> = {
  space_activity: "space_post",
};

/** Actor profile cache — one fetch per actor per tab (bounded). */
const actorCache = new Map<string, ProfileCardDTO | null>();

async function fetchActorProfile(actorId: string): Promise<ProfileCardDTO | null> {
  if (actorCache.has(actorId)) return actorCache.get(actorId) ?? null;
  if (actorCache.size > 200) actorCache.clear();
  try {
    const { data } = await getSupabaseBrowserClient()
      .from("profiles")
      .select("id, username, full_name, avatar_url")
      .eq("id", actorId)
      .maybeSingle();
    const actor: ProfileCardDTO | null = data
      ? {
          id: data.id,
          userId: data.id,
          username: data.username ?? "user",
          fullName: data.full_name ?? "KIVO user",
          avatarUrl: data.avatar_url ?? null,
          bio: "",
          isPrivate: false,
          mood: "",
          viewer: { isSelf: false, isFollowing: false, isRequested: false, followsViewer: false },
        }
      : null;
    actorCache.set(actorId, actor);
    return actor;
  } catch {
    return null; // unreadable/private profile — the toast falls back to "Someone"
  }
}

async function enrichAndMap(row: Record<string, unknown>): Promise<NotificationDTO | null> {
  const actorId = typeof row.actor_id === "string" && row.actor_id ? row.actor_id : null;
  const actor = actorId ? await fetchActorProfile(actorId) : null;
  return mapRealtimeRow(row, actor);
}

/**
 * Maps a `public.notifications` row to the app DTO. Returns null when the row
 * has no identity (dedupe depends on the notification id). The actor comes
 * from the Supabase profiles table; the enriched history (viewer flags etc.)
 * is refetched from the notifications API moments later by the invalidation.
 */
function mapRealtimeRow(row: Record<string, unknown>, actor: ProfileCardDTO | null): NotificationDTO | null {
  const rawType = String(row.type ?? "");
  const appType = SUPABASE_TYPE_TO_APP[rawType] ?? rawType;
  const type: NotificationType = NOTIFICATION_TYPES.has(appType) ? (appType as NotificationType) : "mention";
  const id = typeof row.id === "string" && row.id ? row.id : null;
  if (!id) return null;
  const str = (v: unknown): string | null =>
    typeof v === "string" && v.length > 0 ? v : null;
  return {
    id,
    type,
    actor,
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
