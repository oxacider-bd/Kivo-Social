import "server-only";
import { db } from "@/lib/db";
import {
  createSupabaseServerClient,
  getSupabaseEnv,
  isSupabaseConfigured,
} from "@/lib/supabase";
import { getRequestAuthorization, getRequestOrigin } from "@/lib/request-context";
import type { NotificationDTO, NotificationType, ProfileCardDTO } from "@/types";

const INTERNAL_SECRET = process.env.INTERNAL_SECRET ?? "kivo-internal-dev-secret";
const REALTIME_EMIT_URL = process.env.REALTIME_EMIT_URL ?? "http://127.0.0.1:3004/internal/emit";

/** Fire-and-forget emit to the realtime service (never blocks or fails requests). */
export function emitRealtime(userIds: string[], event: string, payload: unknown) {
  if (userIds.length === 0) return;
  fetch(REALTIME_EMIT_URL, {
    method: "POST",
    headers: { "content-type": "application/json", "x-internal-secret": INTERNAL_SECRET },
    body: JSON.stringify({ userIds, event, payload }),
    signal: AbortSignal.timeout(1500),
  }).catch(() => {
    // realtime is best-effort
  });
}

// ─── Supabase Realtime fan-out ──────────────────────────────────────────────
// The app-database notification is mirrored into the Supabase
// `public.notifications` table so the recipient's client receives it over
// Supabase Realtime (postgres_changes, filtered by recipient_id). The insert
// runs under the ACTOR's verified access token (forwarded by the API client),
// so RLS remains the authorization layer — no service-role key is ever used.
//
// `ref_id` carries the app notification id so the recipient's client can sync
// read-state back to the same row later (single durable record per action).

/** App taxonomy → Supabase taxonomy (public.notification_type enum). */
const SUPABASE_TYPE_BY_APP: Record<string, string> = {
  space_post: "space_activity",
};

let actorCache: { token: string; id: string; at: number } | null = null;
const ACTOR_CACHE_TTL_MS = 60_000;
let fanOutWarned = false;

function warnFanOutOnce(detail: string) {
  if (fanOutWarned) return;
  fanOutWarned = true;
  console.warn(`[notify] Supabase realtime fan-out unavailable (${detail}). Notifications still work via the app database; realtime delivery resumes once Supabase accepts the insert.`);
}

/** Verifies the forwarded access token and returns its user id (cached 60s). */
async function resolveActorId(token: string): Promise<string | null> {
  if (actorCache && actorCache.token === token && Date.now() - actorCache.at < ACTOR_CACHE_TTL_MS) {
    return actorCache.id;
  }
  try {
    const supabase = createSupabaseServerClient();
    if (!supabase) return null;
    const { data, error } = await supabase.auth.getUser(token);
    const id = error ? null : (data.user?.id ?? null);
    if (id) actorCache = { token, id, at: Date.now() };
    return id;
  } catch {
    return null;
  }
}

/**
 * Best-effort insert into Supabase public.notifications under the actor's
 * identity. Never throws — realtime delivery degrades to the next natural
 * notification refetch when this is unavailable.
 */
async function fanOutToSupabaseRealtime(
  recipientSupabaseId: string,
  input: NotifyInput,
  message: string | null,
  refId: string,
): Promise<void> {
  try {
    if (!isSupabaseConfigured()) return;
    const authorization = getRequestAuthorization();
    if (!authorization) return; // legacy local actor (e.g. demo) — mirror-only
    const actorId = await resolveActorId(authorization);
    if (!actorId) {
      warnFanOutOnce("actor token could not be verified");
      return;
    }
    const env = getSupabaseEnv();
    if (!env) return;
    const res = await fetch(`${env.url}/rest/v1/notifications`, {
      method: "POST",
      headers: {
        apikey: env.publishableKey,
        authorization,
        "content-type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        recipient_id: recipientSupabaseId,
        actor_id: actorId,
        type: SUPABASE_TYPE_BY_APP[input.type] ?? input.type,
        ref_id: refId,
        post_id: input.postId ?? null,
        comment_id: input.commentId ?? null,
        space_id: input.spaceId ?? null,
        message,
      }),
      signal: AbortSignal.timeout(4_000),
    });
    if (!res.ok) warnFanOutOnce(`HTTP ${res.status} inserting into public.notifications`);
  } catch (err) {
    warnFanOutOnce(err instanceof Error ? err.message : "network error");
  }
}

// ─── OneSignal Web Push (optional delivery layer) ───────────────────────────
// OneSignal is ONLY a push-delivery transport: Supabase public.notifications
// stays the source of truth. The push targets the recipient's OneSignal
// identity (external_id = their Supabase user UUID, set by the client via
// OneSignal.login). Failures are logged and never affect the social action.
// The REST key is server-only — never exposed to the client bundle.

const ONESIGNAL_REST_KEY = (process.env.ONESIGNAL_REST_API_KEY ?? "").trim();
const ONESIGNAL_APP_ID = (process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID ?? "").trim();
const APP_ORIGIN_FALLBACK = "https://kivo-rho-pearl.vercel.app";

const PUSH_COPY: Record<NotificationType, string> = {
  reaction: "reacted to your post",
  comment: "commented on your post",
  reply: "replied to your comment",
  follow: "started following you",
  follow_accept: "accepted your follow request",
  follow_request: "requested to follow you",
  mention: "mentioned you in a post",
  space_post: "posted in a space you're in",
};

/** Deep link for the push click — production origin, never localhost. */
function pushDestination(
  type: NotificationType,
  postId: string | null,
  actorUsername: string | null,
): string {
  const origin = getRequestOrigin() ?? APP_ORIGIN_FALLBACK;
  if (postId) return `${origin}/?openPost=${encodeURIComponent(postId)}`;
  if (type === "follow" || type === "follow_accept" || type === "follow_request") {
    if (actorUsername) return `${origin}/#/profile/${actorUsername}`;
  }
  return `${origin}/#/notifications`;
}

/**
 * Sends the Web Push for a freshly created notification row. Never throws —
 * OneSignal being unavailable must not affect the social action in any way.
 */
async function pushToOnesignal(input: {
  recipientSupabaseId: string;
  notificationId: string;
  type: NotificationType;
  title: string;
  body: string | null;
  url: string;
}): Promise<void> {
  if (!ONESIGNAL_REST_KEY || !ONESIGNAL_APP_ID) return; // not configured — graceful no-op
  try {
    const res = await fetch("https://api.onesignal.com/notifications", {
      method: "POST",
      headers: {
        authorization: `Basic ${ONESIGNAL_REST_KEY}`,
        "content-type": "application/json",
        // Idempotent per durable notification row — retries/replays never
        // produce duplicate pushes for the same social action.
        "idempotency-key": input.notificationId,
      },
      body: JSON.stringify({
        app_id: ONESIGNAL_APP_ID,
        include_aliases: { external_id: [input.recipientSupabaseId] },
        target_channel: "push",
        headings: { en: input.title },
        contents: { en: input.body || input.title },
        url: input.url,
      }),
      signal: AbortSignal.timeout(4_000),
    });
    if (!res.ok) {
      console.warn(`[notify] OneSignal push HTTP ${res.status} (recipient notified in-app regardless)`);
    }
  } catch (err) {
    console.warn(
      "[notify] OneSignal push failed:",
      err instanceof Error ? err.message : err,
    );
  }
}

export interface NotifyInput {
  userId: string; // recipient
  actorId: string; // who caused it
  type: NotificationType;
  postId?: string | null;
  commentId?: string | null;
  spaceId?: string | null;
  spaceName?: string | null;
  postPreview?: string | null;
  preview?: string | null;
}

const PREF_KEY_BY_TYPE: Record<NotificationType, keyof PrefsShape> = {
  reaction: "reactions",
  comment: "comments",
  reply: "replies",
  follow: "follows",
  follow_accept: "follows",
  follow_request: "follows",
  mention: "mentions",
  space_post: "spaceActivity",
};

interface PrefsShape {
  reactions: boolean;
  comments: boolean;
  replies: boolean;
  follows: boolean;
  mentions: boolean;
  spaceActivity: boolean;
}

const DEFAULT_PREFS: PrefsShape = {
  reactions: true,
  comments: true,
  replies: true,
  follows: true,
  mentions: true,
  spaceActivity: true,
};

/**
 * Creates a notification respecting recipient preferences, and pushes it over realtime.
 * Skips self-notifications. Never throws.
 */
export async function notify(input: NotifyInput) {
  try {
    if (input.userId === input.actorId) return;
    const recipient = await db.user.findUnique({
      where: { id: input.userId },
      select: {
        supabaseId: true,
        profile: { select: { notificationPrefs: true } },
      },
    });
    if (!recipient?.profile) return;
    let prefs: PrefsShape = DEFAULT_PREFS;
    try {
      prefs = { ...DEFAULT_PREFS, ...JSON.parse(recipient.profile.notificationPrefs) };
    } catch {
      // keep defaults
    }
    if (!prefs[PREF_KEY_BY_TYPE[input.type]]) return;

    const notification = await db.notification.create({
      data: {
        userId: input.userId,
        actorId: input.actorId,
        type: input.type,
        postId: input.postId ?? null,
        commentId: input.commentId ?? null,
        spaceId: input.spaceId ?? null,
        spaceName: input.spaceName ?? null,
        postPreview: input.postPreview?.slice(0, 120) ?? null,
        preview: input.preview?.slice(0, 160) ?? null,
      },
      include: {
        actor: { include: { profile: true } },
      },
    });

    const actorProfile = notification.actor?.profile;
    const actor: ProfileCardDTO | null =
      notification.actor && actorProfile
        ? {
            id: actorProfile.id,
            userId: notification.actor.id,
            username: actorProfile.username,
            fullName: actorProfile.fullName,
            avatarUrl: actorProfile.avatarUrl,
            bio: actorProfile.bio,
            isPrivate: actorProfile.isPrivate,
            mood: actorProfile.mood,
            viewer: { isSelf: false, isFollowing: false, isRequested: false, followsViewer: false },
          }
        : null;

    const payload: NotificationDTO = {
      id: notification.id,
      type: notification.type as NotificationType,
      actor,
      postId: notification.postId,
      commentId: notification.commentId,
      spaceId: notification.spaceId,
      spaceName: notification.spaceName,
      postPreview: notification.postPreview,
      preview: notification.preview,
      readAt: null,
      createdAt: notification.createdAt.toISOString(),
    };

    emitRealtime([input.userId], "notification", payload);

    // Supabase Realtime delivery (production transport — see fanOut above).
    const message = notification.preview ?? notification.postPreview ?? null;
    if (recipient.supabaseId) {
      void fanOutToSupabaseRealtime(recipient.supabaseId, input, message, notification.id);

      // OneSignal browser push — same durable row, optional delivery layer.
      const actorName =
        actorProfile?.fullName?.trim() ||
        actorProfile?.username ||
        notification.actor?.email?.split("@")[0] ||
        "Someone";
      const title = `${actorName} ${PUSH_COPY[input.type] ?? "sent you a notification"}`;
      const actorUsername = actorProfile?.username ?? null;
      void pushToOnesignal({
        recipientSupabaseId: recipient.supabaseId,
        notificationId: notification.id,
        type: input.type,
        title,
        body: message,
        url: pushDestination(input.type, notification.postId, actorUsername),
      });
    }
  } catch (err) {
    console.error("[notify] failed:", err);
  }
}
