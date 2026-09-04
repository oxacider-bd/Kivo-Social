import "server-only";
import type { Profile, User } from "@prisma/client";
import type { Privacy, ProfileDTO, SessionUser } from "@/types";

export function mapProfile(profile: Profile): ProfileDTO {
  let prefs = {
    reactions: true,
    comments: true,
    replies: true,
    follows: true,
    mentions: true,
    spaceActivity: true,
  };
  try {
    prefs = { ...prefs, ...JSON.parse(profile.notificationPrefs) };
  } catch {
    // defaults
  }
  return {
    id: profile.id,
    userId: profile.userId,
    username: profile.username,
    fullName: profile.fullName,
    bio: profile.bio,
    avatarUrl: profile.avatarUrl,
    coverUrl: profile.coverUrl,
    mood: profile.mood,
    isPrivate: profile.isPrivate,
    defaultPrivacy: profile.defaultPrivacy as Privacy,
    notificationPrefs: prefs,
    createdAt: profile.createdAt.toISOString(),
  };
}

export function toSessionDTO(
  user: Omit<User, "passwordHash"> & { profile: Profile | null },
): SessionUser {
  if (!user.profile) throw new Error("User profile missing");
  return {
    id: user.id,
    email: user.email,
    createdAt: user.createdAt.toISOString(),
    profile: mapProfile(user.profile),
  };
}
