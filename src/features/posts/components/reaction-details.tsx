"use client";

import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ProfileMiniCard } from "@/components/profile-mini-card";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { REACTIONS, reactionMeta } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { formatCount } from "@/lib/format";
import type { PostDTO, ReactionType, ReactionUserDTO } from "@/types";

/**
 * Reaction details popover: chips per reaction type with counts + the list
 * of people who reacted with the selected type (ProfileMiniCard rows).
 */
export function ReactionDetails({
  post,
  children,
}: {
  post: PostDTO;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [activeType, setActiveType] = useState<ReactionType | null>(null);

  const types = post.topReactions.map((t) => t.type);
  const selected = activeType ?? types[0] ?? null;

  const { data: users, isFetching } = useQuery({
    queryKey: ["reaction-users", post.id, selected],
    queryFn: ({ signal }) =>
      api<ReactionUserDTO[]>(`/api/posts/${post.id}/reactions?type=${selected}&limit=50`, { signal }),
    enabled: open && !!selected,
    staleTime: 10_000,
  });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent align="start" side="top" className="w-72 rounded-xl p-0" onOpenAutoFocus={(e) => e.preventDefault()}>
        <div className="flex flex-wrap gap-1 border-b p-2">
          {types.map((type) => {
            const meta = reactionMeta(type);
            const count = post.topReactions.find((t) => t.type === type)?.count ?? 0;
            return (
              <button
                key={type}
                type="button"
                onClick={() => setActiveType(type)}
                aria-pressed={selected === type}
                className={cn(
                  "flex items-center gap-1 rounded-full px-2 py-1 text-xs outline-none transition-colors",
                  selected === type
                    ? "bg-brand-soft font-semibold text-brand"
                    : "text-muted-foreground hover:bg-accent",
                )}
              >
                <span aria-hidden="true">{meta.emoji}</span>
                {formatCount(count)}
              </button>
            );
          })}
        </div>
        <div className="max-h-64 overflow-y-auto scrollbar-slim px-3 py-1">
          {isFetching && (
            <div className="space-y-2 py-2">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex items-center gap-3 py-1">
                  <Skeleton className="skeleton h-10 w-10 rounded-full" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="skeleton h-3.5 w-28" />
                    <Skeleton className="skeleton h-3 w-20" />
                  </div>
                </div>
              ))}
            </div>
          )}
          {!isFetching && users && users.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No reactions here yet.
            </p>
          )}
          {!isFetching &&
            users?.map((u) => (
              <div key={u.profile.id + u.type} className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <ProfileMiniCard
                    profile={u.profile}
                    subtitle={REACTIONS.find((r) => r.type === u.type)?.label}
                  />
                </div>
                <span className="text-base" aria-hidden="true">
                  {reactionMeta(u.type).emoji}
                </span>
              </div>
            ))}
          {!isFetching && users === null && (
            <div className="flex justify-center py-6">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
