"use client";

import { memo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useSession } from "@/lib/session-store";
import { UserAvatar } from "@/components/user-avatar";
import { MomentComposer } from "@/features/moments/components/moment-composer";
import { MomentViewer } from "@/features/moments/components/moment-viewer";
import type { MomentAuthorGroupDTO } from "@/types";

/**
 * Horizontal "stories" strip: your-moment tile + one ring per followed author.
 * Self-contained: owns its data, composer and viewer. Errors stay silent —
 * moments are peripheral and must never break the page around them.
 */
export function MomentsRow() {
  const [composerOpen, setComposerOpen] = useState(false);
  const [viewer, setViewer] = useState<{ groupIndex: number; momentIndex?: number } | null>(null);
  const queryClient = useQueryClient();
  const { user } = useSession();

  const { data, isLoading, isError } = useQuery<MomentAuthorGroupDTO[]>({
    queryKey: ["moments"],
    queryFn: () => api<MomentAuthorGroupDTO[]>("/api/moments"),
  });

  if (isError) return null;

  const groups = data ?? [];
  const selfGroup = groups.find((g) => g.isSelf);

  function closeViewer() {
    setViewer(null);
    // Rings/seen states may have changed while watching.
    void queryClient.invalidateQueries({ queryKey: ["moments"] });
  }

  return (
    <section aria-label="Moments" className="w-full">
      <div className="scrollbar-none flex items-start gap-4 overflow-x-auto pb-1">
        {/* Your moment — always opens the composer */}
        <div className="flex shrink-0 flex-col items-center gap-1.5">
          <button
            type="button"
            onClick={() => setComposerOpen(true)}
            className="group relative rounded-full outline-none transition-transform duration-150 active:scale-95 focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Create a new moment"
          >
            <span
              className={cn(
                "flex items-center justify-center rounded-full p-[3px] transition-colors duration-200",
                selfGroup ? "moment-ring" : "border-2 border-dashed border-brand/60 group-hover:border-brand",
              )}
            >
              <UserAvatar
                username={user?.profile.username ?? "you"}
                fullName={user?.profile.fullName ?? "You"}
                avatarUrl={user?.profile.avatarUrl}
                size={58}
                linkToProfile={false}
                className="border-2 border-background"
              />
            </span>
            {!selfGroup && (
              <span className="absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-brand text-brand-foreground shadow-sm">
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              </span>
            )}
          </button>
          <span className="w-16 truncate text-center text-[11px] text-muted-foreground">
            Your moment
          </span>
        </div>

        {/* Loading: five shimmer circles */}
        {isLoading && (
          <>
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="flex shrink-0 flex-col items-center gap-1.5">
                <div className="skeleton h-16 w-16 rounded-full" />
                <div className="skeleton h-3 w-14 rounded-full" />
              </div>
            ))}
          </>
        )}

        {/* Author groups */}
        {!isLoading &&
          groups.map((group, i) => (
            <MomentTile
              key={group.author.userId}
              group={group}
              onOpen={() => setViewer({ groupIndex: i })}
            />
          ))}

        {/* Empty nudge */}
        {!isLoading && groups.length === 0 && (
          <button
            type="button"
            onClick={() => setComposerOpen(true)}
            className="self-center rounded-full px-2 py-2 text-sm text-muted-foreground transition hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Share a moment
          </button>
        )}
      </div>

      <MomentComposer open={composerOpen} onClose={() => setComposerOpen(false)} />
      {viewer && groups.length > 0 && (
        <MomentViewer
          groups={groups}
          groupIndex={viewer.groupIndex}
          momentIndex={viewer.momentIndex}
          onClose={closeViewer}
        />
      )}
    </section>
  );
}

const MomentTile = memo(function MomentTile({
  group,
  onOpen,
}: {
  group: MomentAuthorGroupDTO;
  onOpen: () => void;
}) {
  return (
    <div className="flex shrink-0 flex-col items-center gap-1.5">
      <button
        type="button"
        onClick={onOpen}
        className="rounded-full outline-none transition-transform duration-150 active:scale-95 focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={
          group.isSelf
            ? "View your moments"
            : `View ${group.author.fullName}'s moments`
        }
      >
        <span
          className={cn(
            "flex items-center justify-center rounded-full p-[3px] transition duration-200",
            group.allSeen ? "ring-2 ring-border/60" : "moment-ring",
          )}
        >
          <UserAvatar
            username={group.author.username}
            fullName={group.author.fullName}
            avatarUrl={group.author.avatarUrl}
            size={58}
            linkToProfile={false}
            className={cn("border-2 border-background", group.allSeen && "opacity-80 saturate-[.55]")}
          />
        </span>
      </button>
      <span className="w-16 truncate text-center text-[11px]">
        {group.isSelf ? "You" : group.author.fullName}
      </span>
    </div>
  );
});
