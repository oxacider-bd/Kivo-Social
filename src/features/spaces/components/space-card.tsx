"use client";

import { memo } from "react";
import { Crown, FileText, Users } from "lucide-react";
import { navigateTo } from "@/lib/router";
import { formatCount, initials } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { SpaceDTO } from "@/types";

/** Premium space tile used in the Spaces grid. */
export const SpaceCard = memo(function SpaceCard({
  space,
  onToggleMembership,
}: {
  space: SpaceDTO;
  onToggleMembership?: (space: SpaceDTO) => void;
}) {
  const isOwner = space.viewer.role === "OWNER";

  function open() {
    navigateTo(`/spaces/${space.slug}`);
  }

  return (
    <article
      className="card-shadow group cursor-pointer overflow-hidden rounded-2xl border bg-card transition-all duration-200 hover:border-brand/40 hover:shadow-md focus-within:ring-2 focus-within:ring-ring"
      onClick={open}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          open();
        }
      }}
      tabIndex={0}
      role="link"
      aria-label={`Open space ${space.name}`}
    >
      <div className="relative h-24 w-full overflow-hidden bg-muted">
        {space.coverUrl ? (
           
          <img
            src={space.coverUrl}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
          />
        ) : (
          <div
            className="h-full w-full bg-gradient-to-br from-brand-soft via-accent to-brand-soft"
            aria-hidden="true"
          />
        )}
      </div>

      <div className="p-4 pt-0">
        {/* Avatar is the only element overlapping the cover */}
        <div className="-mt-7 mb-3 flex items-end">
          {space.avatarUrl ? (
             
            <img
              src={space.avatarUrl}
              alt={`${space.name} avatar`}
              loading="lazy"
              className="h-14 w-14 rounded-full border-4 border-card bg-muted object-cover"
            />
          ) : (
            <span
              className="flex h-14 w-14 items-center justify-center rounded-full border-4 border-card bg-brand-soft text-lg font-bold text-brand"
              aria-hidden="true"
            >
              {initials(space.name)}
            </span>
          )}
        </div>

        <h3 className="truncate font-semibold">{space.name}</h3>
        {space.description ? (
          <p className="mt-0.5 line-clamp-2 min-h-[2.5rem] text-sm text-muted-foreground">
            {space.description}
          </p>
        ) : (
          <p className="mt-0.5 min-h-[2.5rem] text-sm italic text-muted-foreground/60">
            No description yet.
          </p>
        )}

        <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
          <div className="flex min-w-0 items-center gap-4">
            <span className="inline-flex items-center gap-1">
              <Users className="h-3.5 w-3.5" aria-hidden="true" />
              {formatCount(space.counts.members)} members
            </span>
            <span className="inline-flex items-center gap-1">
              <FileText className="h-3.5 w-3.5" aria-hidden="true" />
              {formatCount(space.counts.posts)} posts
            </span>
          </div>
          {isOwner ? (
            <span className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-full bg-brand-soft px-2.5 py-1 text-xs font-semibold text-brand">
              <Crown className="h-3.5 w-3.5" aria-hidden="true" /> Owner
            </span>
          ) : onToggleMembership ? (
            <Button
              size="sm"
              variant={space.viewer.isMember ? "secondary" : "default"}
              className={cn(
                "h-8 ml-auto shrink-0 rounded-full px-3.5 text-[13px] font-semibold active:scale-[0.98]",
                space.viewer.isMember &&
                  "bg-brand-soft text-brand hover:bg-brand-soft/70 hover:text-brand",
              )}
              onClick={(e) => {
                e.stopPropagation();
                onToggleMembership(space);
              }}
              aria-label={space.viewer.isMember ? `Leave ${space.name}` : `Join ${space.name}`}
            >
              {space.viewer.isMember ? "Joined" : "Join"}
            </Button>
          ) : null}
        </div>
      </div>
    </article>
  );
});

/** Skeleton matching SpaceCard's layout. */
export function SpaceCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-2xl border bg-card" aria-hidden="true">
      <div className="skeleton h-24 w-full" />
      <div className="p-4">
        <div className="skeleton -mt-7 mb-2 h-14 w-14 rounded-full border-4 border-card" />
        <div className="skeleton h-4 w-2/3 rounded-md" />
        <div className="skeleton mt-2 h-3 w-full rounded-md" />
        <div className="skeleton mt-1 h-3 w-4/5 rounded-md" />
        <div className="skeleton mt-3 h-3 w-1/2 rounded-md" />
      </div>
    </div>
  );
}
