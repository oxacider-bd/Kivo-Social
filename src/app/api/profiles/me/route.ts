import type { Prisma, Profile } from "@prisma/client";
import { db } from "@/lib/db";
import { fail, ok, parseBody, requireUser, route } from "@/lib/api-helpers";
import { updateProfileSchema } from "@/lib/validation";
import { mapProfile } from "@/lib/dto";
import type { ProfileDetailDTO } from "@/types";

// ─── GET /api/profiles/me ─────────────────────────────────────────────────────

export const GET = route(async ({ user }) => {
  const authed = requireUser(user);

  const counts = await db.user.findUnique({
    where: { id: authed.id },
    select: {
      _count: { select: { posts: true, followers: true, following: true } },
    },
  });

  const data: ProfileDetailDTO = {
    // The session profile is the live Profile row minus updatedAt — safe to cast.
    ...mapProfile(authed.profile as Profile),
    counts: {
      posts: counts?._count.posts ?? 0,
      followers: counts?._count.followers ?? 0,
      following: counts?._count.following ?? 0,
    },
    viewer: {
      isSelf: true,
      isFollowing: false,
      isRequested: false,
      followsViewer: false,
      canViewContent: true,
    },
  };
  return ok(data);
});

// ─── PATCH /api/profiles/me ───────────────────────────────────────────────────

export const PATCH = route(async ({ req, user }) => {
  const authed = requireUser(user);
  const body = await parseBody(req, updateProfileSchema);

  // Uniqueness check on username (excluding self).
  if (body.username !== undefined) {
    const existing = await db.profile.findUnique({
      where: { username: body.username },
      select: { userId: true },
    });
    if (existing && existing.userId !== authed.id) {
      return fail("CONFLICT", "That username is taken. Try another one.", 409);
    }
  }

  const data: Prisma.ProfileUpdateInput = {};
  if (body.fullName !== undefined) data.fullName = body.fullName;
  if (body.username !== undefined) data.username = body.username;
  if (body.bio !== undefined) data.bio = body.bio;
  if (body.mood !== undefined) data.mood = body.mood;
  if (body.avatarUrl !== undefined) data.avatarUrl = body.avatarUrl;
  if (body.coverUrl !== undefined) data.coverUrl = body.coverUrl;
  if (body.isPrivate !== undefined) data.isPrivate = body.isPrivate;
  if (body.defaultPrivacy !== undefined) data.defaultPrivacy = body.defaultPrivacy;
  if (body.notificationPrefs !== undefined) {
    data.notificationPrefs = JSON.stringify(body.notificationPrefs);
  }

  const updated = await db.profile.update({
    where: { userId: authed.id },
    data,
  });
  return ok(mapProfile(updated));
});
