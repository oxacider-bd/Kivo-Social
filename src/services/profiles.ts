"use client";

import { getSupabaseBrowserClient } from "@/lib/supabase";
import { mapSupabaseError } from "@/lib/supabase-errors";
import type { NotificationPrefs, Privacy, ProfileDTO } from "@/types";

/**
 * Supabase profile services.
 * All reads are filtered by the authenticated user's id (auth.uid()) and
 * protected by RLS — no client-supplied ids are trusted for ownership.
 */

// Only the columns the app actually needs — no `select *`.
const PROFILE_COLUMNS =
  "id, username, full_name, bio, avatar_url, cover_url, mood, visibility, is_verified, created_at";

export interface SupabaseProfileRow {
  id: string;
  username: string;
  full_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  cover_url: string | null;
  mood: string | null;
  visibility: string | null;
  is_verified: boolean | null;
  created_at: string;
}

const DEFAULT_PREFS: NotificationPrefs = {
  reactions: true,
  comments: true,
  replies: true,
  follows: true,
  mentions: true,
  spaceActivity: true,
};

/**
 * Fetch the signed-in user's own profile row from Supabase.
 * Returns null when the row doesn't exist yet (e.g. the create-profile
 * trigger hasn't fired moments after signup).
 */
export async function fetchOwnProfile(userId: string): Promise<SupabaseProfileRow | null> {
  try {
    const { data, error } = await getSupabaseBrowserClient()
      .from("profiles")
      .select(PROFILE_COLUMNS)
      .eq("id", userId)
      .maybeSingle();
    if (error) throw error;
    return (data as SupabaseProfileRow | null) ?? null;
  } catch (err) {
    throw mapSupabaseError(
      err instanceof Error ? { message: err.message } : { message: "Profile lookup failed." }
    );
  }
}

/**
 * Maps a Supabase `profiles` row into the app's ProfileDTO shape.
 * `fallback` supplies legacy fields that live only in the app database
 * (notification preferences, default privacy) so the existing UI keeps
 * working unchanged while data ownership moves to Supabase.
 */
export function mapSupabaseProfileToDTO(
  row: SupabaseProfileRow,
  fallback?: Partial<ProfileDTO> & { userId?: string },
): ProfileDTO {
  const visibility = (row.visibility ?? "public").toString().toLowerCase();
  const isPrivate = visibility.includes("private");
  const defaultPrivacy: Privacy = visibility.includes("follower")
    ? "FOLLOWERS"
    : isPrivate
      ? "ONLY_ME"
      : "PUBLIC";

  return {
    id: row.id,
    userId: fallback?.userId ?? row.id,
    username: row.username || fallback?.username || "user",
    fullName: row.full_name || fallback?.fullName || "KIVO user",
    bio: row.bio ?? fallback?.bio ?? "",
    avatarUrl: row.avatar_url ?? fallback?.avatarUrl ?? null,
    coverUrl: row.cover_url ?? fallback?.coverUrl ?? null,
    mood: row.mood ?? fallback?.mood ?? "",
    isPrivate,
    defaultPrivacy: fallback?.defaultPrivacy ?? defaultPrivacy,
    notificationPrefs: fallback?.notificationPrefs ?? DEFAULT_PREFS,
    createdAt: row.created_at ?? fallback?.createdAt ?? new Date().toISOString(),
  };
}
