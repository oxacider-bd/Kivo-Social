"use client";
/* eslint-disable react-hooks/refs -- useInfiniteList returns sentinelRef mixed with plain react-query state; reads below are query state, and sentinelRef is only ever attached to a DOM node (its documented contract). */

import { useCallback, useMemo } from "react";
import { api } from "@/lib/api";
import { useInfiniteList } from "@/hooks/use-infinite";
import type { Page, ProfileCardDTO } from "@/types";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ProfileMiniCard } from "@/components/profile-mini-card";
import { EmptyState, ErrorState } from "@/components/empty-state";
import { Users } from "lucide-react";

interface FollowListDialogProps {
  open: boolean;
  onClose: () => void;
  username: string;
  mode: "followers" | "following";
}

/** Dialog listing a profile's followers or following (paginated). */
export function FollowListDialog({ open, onClose, username, mode }: FollowListDialogProps) {
  const fetchPage = useCallback(
    (cursor: string | null, signal: AbortSignal) =>
      api<Page<ProfileCardDTO>>(
        `/api/profiles/${encodeURIComponent(username)}/${mode}${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`,
        { signal },
      ),
    [username, mode],
  );

  const list = useInfiniteList<ProfileCardDTO>(["profile-" + mode, username], fetchPage, {
    enabled: open,
  });

  const title = mode === "followers" ? "Followers" : "Following";
  const skeletons = useMemo(() => [0, 1, 2, 3, 4], []);

  return (
    <Dialog open={open} onOpenChange={(v) => (!v ? onClose() : undefined)}>
      <DialogContent className="flex max-h-[80svh] flex-col p-0 sm:max-w-md">
        <DialogHeader className="border-b px-5 py-4">
          <DialogTitle className="text-base">{title}</DialogTitle>
          <DialogDescription className="sr-only">
            People who {mode === "followers" ? "follow" : "are followed by"} @{username}.
          </DialogDescription>
        </DialogHeader>

        <div className="scrollbar-slim min-h-0 flex-1 overflow-y-auto px-5 py-2">
          {list.isLoading ? (
            <div className="py-2" aria-label="Loading list" role="status">
              {skeletons.map((i) => (
                <div key={i} className="flex items-center gap-3 py-2.5">
                  <div className="skeleton h-10 w-10 rounded-full" />
                  <div className="flex-1 space-y-1.5">
                    <div className="skeleton h-3.5 w-32 rounded-md" />
                    <div className="skeleton h-3 w-20 rounded-md" />
                  </div>
                  <div className="skeleton h-9 w-24 rounded-full" />
                </div>
              ))}
            </div>
          ) : list.isError ? (
            <ErrorState
              className="my-6 border"
              title="Couldn't load this list"
              description="Please try again in a moment."
              action={
                <Button variant="outline" size="sm" onClick={() => void list.refetch()}>
                  Try again
                </Button>
              }
            />
          ) : list.items.length === 0 ? (
            <EmptyState
              className="my-6"
              icon={<Users className="h-10 w-10" />}
              title={mode === "followers" ? "No followers yet" : "Not following anyone yet"}
              description={
                mode === "followers"
                  ? `When people follow @${username}, they'll show up here.`
                  : `When @${username} follows people, they'll show up here.`
              }
            />
          ) : (
            <>
              {list.items.map((card) => (
                <ProfileMiniCard key={card.userId} profile={card} />
              ))}
              {list.isFetchingNextPage && (
                <div className="py-2" aria-hidden="true">
                  <div className="flex items-center gap-3 py-2.5">
                    <div className="skeleton h-10 w-10 rounded-full" />
                    <div className="flex-1 space-y-1.5">
                      <div className="skeleton h-3.5 w-32 rounded-md" />
                      <div className="skeleton h-3 w-20 rounded-md" />
                    </div>
                  </div>
                </div>
              )}
              {list.hasNextPage && (
                <div className="flex justify-center py-3">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void list.fetchNextPage()}
                    disabled={list.isFetchingNextPage}
                  >
                    {list.isFetchingNextPage ? "Loading…" : "Load more"}
                  </Button>
                </div>
              )}
              <div ref={list.sentinelRef} aria-hidden="true" />
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
