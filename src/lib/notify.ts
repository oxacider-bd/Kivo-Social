import "server-only";
import { db } from "@/lib/db";
import {
  createSupabaseServerClient,
  getSupabaseEnv,
  isSupabaseConfigured,
} from "@/lib/supabase";
import { getRequestAuthorization } from "@/lib/request-context";
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
        type: input.type,
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
      void fanOutToSupabaseRealtime(recipient.supabaseId, input, message);
    }
  } catch (err) {
    console.error("[notify] failed:", err);
  }
}
