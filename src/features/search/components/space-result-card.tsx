"use client";

import { memo, useState } from "react";
import { Users } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { navigateTo } from "@/lib/router";
import { formatCount, initials } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { SpaceDTO } from "@/types";

/**
 * Compact space row used in search results / lists.
 * Join/leave uses the spaces endpoints (agent 2-d) with an optimistic toggle.
 */
export const SpaceResultCard = memo(function SpaceResultCard({
  space,
}: {
  space: SpaceDTO;
}) {
  const [joined, setJoined] = useState(space.viewer.isMember);
  const [busy, setBusy] = useState(false);

  async function toggleJoin() {
    if (busy) return;
    const next = !joined;
    setJoined(next);
    setBusy(true);
    try {
      await api(`/api/spaces/${encodeURIComponent(space.slug)}/join`, {
        method: next ? "POST" : "DELETE",
      });
      if (next) toast(`Welcome to ${space.name}!`);
    } catch (err) {
      setJoined(!next);
      toast.error(err instanceof Error ? err.message : "Could not update membership. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-3 rounded-xl border bg-card p-3 card-shadow transition-all duration-200 hover:border-brand/40 hover:bg-accent/40 hover:shadow-sm">
      <button
        className="flex min-w-0 flex-1 items-center gap-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg"
        onClick={() => navigateTo(`/spaces/${space.slug}`)}
        aria-label={`Open space ${space.name}`}
      >
        {space.avatarUrl || space.coverUrl ? (
          <img
            src={(space.avatarUrl ?? space.coverUrl) as string}
            alt=""
            loading="lazy"
            className="h-11 w-11 shrink-0 rounded-xl border border-border/60 bg-muted object-cover"
          />
        ) : (
          <span
            aria-hidden
            className="brand-gradient-text flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-sm font-bold"
          >
            {initials(space.name)}
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold leading-tight">{space.name}</span>
          {space.description ? (
            <span className="block truncate text-xs text-muted-foreground">{space.description}</span>
          ) : null}
          <span className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
            <Users className="h-3 w-3" aria-hidden />
            {formatCount(space.counts.members)} members
          </span>
        </span>
      </button>
      <Button
        size="sm"
        variant={joined ? "secondary" : "default"}
        className={cn(
          "h-9 shrink-0 rounded-full px-4 text-[13px] font-semibold active:scale-[0.98]",
          joined && "bg-brand-soft text-brand hover:bg-brand-soft/70 hover:text-brand",
        )}
        onClick={toggleJoin}
        disabled={busy}
        aria-pressed={joined}
        aria-label={joined ? `Leave ${space.name}` : `Join ${space.name}`}
      >
        {joined ? "Joined" : "Join"}
      </Button>
    </div>
  );
});
