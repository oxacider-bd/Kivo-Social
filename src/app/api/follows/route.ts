import { z } from "zod";
import { db } from "@/lib/db";
import { fail, HttpError, ok, parseBody, requireUser, route } from "@/lib/api-helpers";
import { rateLimit } from "@/lib/rate-limit";
import { notify } from "@/lib/notify";

const usernameBodySchema = z.object({
  username: z.string().trim().toLowerCase().min(1, "Which account?").max(30),
});

// ─── POST /api/follows → {status: "following" | "requested"} ─────────────────

export const POST = route(async ({ req, user }) => {
  const authed = requireUser(user);
  if (!rateLimit(`follow:${authed.id}`, 30, 60_000)) {
    throw new HttpError("RATE_LIMITED");
  }

  const body = await parseBody(req, usernameBodySchema);
  if (body.username === authed.profile.username.toLowerCase()) {
    return fail("VALIDATION", "You can't follow yourself.", 422);
  }

  const target = await db.profile.findUnique({
    where: { username: body.username },
    select: { userId: true, isPrivate: true },
  });
  if (!target) throw new HttpError("NOT_FOUND", "We couldn't find that account.");

  // Already following → idempotent success.
  const existing = await db.follow.findUnique({
    where: {
      followerId_followingId: { followerId: authed.id, followingId: target.userId },
    },
    select: { id: true },
  });
  if (existing) return ok({ status: "following" as const });

  if (target.isPrivate) {
    await db.followRequest.upsert({
      where: {
        requesterId_targetId: { requesterId: authed.id, targetId: target.userId },
      },
      update: { status: "PENDING" },
      create: { requesterId: authed.id, targetId: target.userId, status: "PENDING" },
    });
    await notify({
      userId: target.userId,
      actorId: authed.id,
      type: "follow_request",
      preview: "wants to follow you",
    });
    return ok({ status: "requested" as const });
  }

  await db.follow
    .create({ data: { followerId: authed.id, followingId: target.userId } })
    .catch(() => {
      // lost a race with a duplicate follow — treat as success
    });
  // Clean up any stale pending request (e.g. the target recently went public).
  await db.followRequest.deleteMany({
    where: { requesterId: authed.id, targetId: target.userId },
  });
  await notify({
    userId: target.userId,
    actorId: authed.id,
    type: "follow",
    preview: "started following you",
  });
  return ok({ status: "following" as const });
});

// ─── DELETE /api/follows → {status: "none"} ──────────────────────────────────

export const DELETE = route(async ({ req, user }) => {
  const authed = requireUser(user);
  const body = await parseBody(req, usernameBodySchema);

  const target = await db.profile.findUnique({
    where: { username: body.username },
    select: { userId: true },
  });
  if (!target) throw new HttpError("NOT_FOUND", "We couldn't find that account.");

  // Unfollow (no-op when not following) and cancel any pending request viewer → target.
  await db.follow.deleteMany({
    where: { followerId: authed.id, followingId: target.userId },
  });
  await db.followRequest.deleteMany({
    where: { requesterId: authed.id, targetId: target.userId, status: "PENDING" },
  });
  return ok({ status: "none" as const });
});
