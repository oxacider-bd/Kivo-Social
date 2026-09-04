"use client";

import { UserAvatar } from "@/components/user-avatar";
import { FollowButton, type FollowStatus } from "@/components/follow-button";
import { navigateTo } from "@/lib/router";
import type { ProfileCardDTO } from "@/types";

/** Compact person row used in lists (followers, suggestions, search, members). */
export function ProfileMiniCard({
  profile,
  followStatus,
  role,
  showFollow = true,
  subtitle,
}: {
  profile: ProfileCardDTO;
  followStatus?: FollowStatus;
  role?: string | null;
  showFollow?: boolean;
  subtitle?: string | null;
}) {
  return (
    <div className="flex items-center gap-3 py-2">
      <button
        className="flex min-w-0 flex-1 items-center gap-3 rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={() => navigateTo(`/profile/${profile.username}`)}
        aria-label={`View ${profile.fullName}'s profile`}
      >
        <UserAvatar
          username={profile.username}
          fullName={profile.fullName}
          avatarUrl={profile.avatarUrl}
          size={40}
          linkToProfile={false}
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold leading-tight">
            {profile.fullName}
          </span>
          <span className="block truncate text-xs text-muted-foreground">
            @{profile.username}
            {role ? ` · ${role}` : ""}
            {subtitle ? ` · ${subtitle}` : ""}
          </span>
        </span>
      </button>
      {showFollow && !profile.viewer.isSelf && (
        <FollowButton username={profile.username} initialStatus={followStatus ?? (profile.viewer.isFollowing ? "following" : profile.viewer.isRequested ? "requested" : "none")} size="sm" />
      )}
    </div>
  );
}
