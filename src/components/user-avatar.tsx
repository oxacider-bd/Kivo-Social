"use client";

import Link from "next/link";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { initials } from "@/lib/format";

export function UserAvatar({
  username,
  fullName,
  avatarUrl,
  size = 40,
  className,
  linkToProfile = true,
}: {
  username: string;
  fullName: string;
  avatarUrl?: string | null;
  size?: number;
  className?: string;
  linkToProfile?: boolean;
}) {
  const inner = (
    <Avatar
      className={cn("border border-border/60", className)}
      style={{ width: size, height: size }}
    >
      {avatarUrl ? <AvatarImage src={avatarUrl} alt={`${fullName} (@${username})`} loading="lazy" /> : null}
      <AvatarFallback className="brand-gradient-text bg-brand-soft text-[0.8em] font-bold">
        {initials(fullName || username)}
      </AvatarFallback>
    </Avatar>
  );
  if (!linkToProfile) return inner;
  return (
    <Link
      href={`#/profile/${username}`}
      aria-label={`${fullName}'s profile`}
      className="shrink-0 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
      onClick={(e) => e.stopPropagation()}
    >
      {inner}
    </Link>
  );
}
