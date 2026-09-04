"use client";
/* eslint-disable react-hooks/refs -- useInfiniteList returns sentinelRef mixed with plain react-query state; reads below are query state, and sentinelRef is only ever attached to a DOM node (its documented contract). */

import { useState } from "react";
import { useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { Plus, Search, SearchX, Users } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useDebounced, useInfiniteList, makePageFetcher } from "@/hooks/use-infinite";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState, ErrorState } from "@/components/empty-state";
import {
  SpaceCard,
  SpaceCardSkeleton,
} from "@/features/spaces/components/space-card";
import { CreateSpaceDialog } from "@/features/spaces/components/create-space-dialog";
import type { Page, SpaceDTO, SpaceRole } from "@/types";

type SpaceTab = "discover" | "my";

/** The Spaces directory: discover / my spaces, search, join with optimism. */
export default function SpacesView() {
  const [tab, setTab] = useState<SpaceTab>("discover");
  const [search, setSearch] = useState("");
  const q = useDebounced(search.trim().toLowerCase(), 300);
  const [createOpen, setCreateOpen] = useState(false);
  const queryClient = useQueryClient();

  const listKey = ["spaces", tab, q] as const;
  const spaces = useInfiniteList<SpaceDTO>(
    listKey,
    makePageFetcher<SpaceDTO>((cursor) => {
      const params = new URLSearchParams({ tab, limit: "12" });
      if (q) params.set("q", q);
      if (cursor) params.set("cursor", cursor);
      return `/api/spaces?${params.toString()}`;
    }),
  );

  function applyMembership(
    spaceId: string,
    patch: { isMember: boolean; role: SpaceRole | null },
  ) {
    queryClient.setQueryData<InfiniteData<Page<SpaceDTO>>>(listKey, (old) => {
      if (!old) return old;
      return {
        ...old,
        pages: old.pages.map((page) => ({
          ...page,
          items: page.items.map((s) =>
            s.id === spaceId
              ? {
                  ...s,
                  counts: {
                    ...s.counts,
                    members: Math.max(
                      0,
                      s.counts.members + (patch.isMember ? 1 : -1),
                    ),
                  },
                  viewer: {
                    ...s.viewer,
                    isMember: patch.isMember || s.viewer.role === "OWNER",
                    role:
                      s.viewer.role === "OWNER"
                        ? s.viewer.role
                        : patch.isMember
                          ? patch.role
                          : null,
                  },
                }
              : s,
          ),
        })),
      };
    });
  }

  async function toggleMembership(space: SpaceDTO) {
    const isMember = space.viewer.isMember;
    const snapshot = queryClient.getQueryData(listKey);
    applyMembership(space.id, { isMember: !isMember, role: "MEMBER" });
    try {
      if (isMember) {
        await api<{ isMember: boolean }>(`/api/spaces/${space.slug}/leave`, {
          method: "POST",
        });
        toast(`You left ${space.name}`);
      } else {
        await api<{ isMember: boolean }>(`/api/spaces/${space.slug}/join`, {
          method: "POST",
        });
        toast.success(`Welcome to ${space.name}!`);
      }
      // Detail view (if cached) may show membership too.
      void queryClient.invalidateQueries({ queryKey: ["space", space.slug] });
    } catch (err) {
      queryClient.setQueryData(listKey, snapshot); // rollback
      toast.error(err instanceof Error ? err.message : "That didn't work. Try again.");
    }
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-4 pb-10 pt-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Spaces</h1>
          <p className="text-sm text-muted-foreground">Find your people.</p>
        </div>
        <Button
          className="rounded-full font-semibold active:scale-[0.98]"
          onClick={() => setCreateOpen(true)}
          aria-label="Create a space"
        >
          <Plus className="h-4 w-4" aria-hidden="true" /> Create space
        </Button>
      </header>

      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
        <Tabs
          value={tab}
          onValueChange={(v) => setTab(v as SpaceTab)}
        >
          <TabsList className="h-auto justify-start gap-6 rounded-none border-b bg-transparent p-0">
            <TabsTrigger
              value="discover"
              className="h-auto flex-none rounded-none border-0 border-b-2 border-transparent bg-transparent px-1 pb-2.5 pt-1 text-sm font-medium text-muted-foreground shadow-none transition-colors duration-150 hover:text-foreground data-[state=active]:border-brand data-[state=active]:bg-transparent data-[state=active]:font-semibold data-[state=active]:text-foreground data-[state=active]:shadow-none dark:data-[state=active]:border-brand dark:data-[state=active]:bg-transparent"
            >
              Discover
            </TabsTrigger>
            <TabsTrigger
              value="my"
              className="h-auto flex-none rounded-none border-0 border-b-2 border-transparent bg-transparent px-1 pb-2.5 pt-1 text-sm font-medium text-muted-foreground shadow-none transition-colors duration-150 hover:text-foreground data-[state=active]:border-brand data-[state=active]:bg-transparent data-[state=active]:font-semibold data-[state=active]:text-foreground data-[state=active]:shadow-none dark:data-[state=active]:border-brand dark:data-[state=active]:bg-transparent"
            >
              My spaces
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="relative sm:ml-auto sm:w-64">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search spaces"
            aria-label="Search spaces"
            className="h-10 rounded-full border bg-muted/50 pl-9 transition-all duration-200 focus-visible:border-brand/50 focus-visible:bg-card focus-visible:ring-2 focus-visible:ring-brand/15"
          />
        </div>
      </div>

      <section className="mt-5" aria-label={tab === "my" ? "My spaces" : "Discover spaces"}>
        {spaces.isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <SpaceCardSkeleton key={i} />
            ))}
          </div>
        ) : spaces.isError ? (
          <ErrorState
            title="Spaces couldn't load"
            description="Check your connection and try again."
            action={
              <Button variant="outline" onClick={() => void spaces.refetch()}>
                Try again
              </Button>
            }
          />
        ) : spaces.items.length === 0 ? (
          tab === "my" ? (
            <EmptyState
              icon={<Users className="h-10 w-10" aria-hidden="true" />}
              title="You haven't joined any spaces yet."
              description="Discover communities that match your vibe — or start your own."
              action={
                <Button className="rounded-full active:scale-[0.98]" onClick={() => setTab("discover")}>
                  Browse spaces
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={<SearchX className="h-10 w-10" aria-hidden="true" />}
              title={q ? `No spaces match “${search.trim()}”` : "No spaces yet"}
              description={
                q ? "Try a different search — or create the space you're looking for." : "Be the first to create one!"
              }
              action={
                <Button className="rounded-full active:scale-[0.98]" onClick={() => setCreateOpen(true)}>
                  <Plus className="h-4 w-4" aria-hidden="true" /> Create a space
                </Button>
              }
            />
          )
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {spaces.items.map((space) => (
                <SpaceCard
                  key={space.id}
                  space={space}
                  onToggleMembership={(s) => void toggleMembership(s)}
                />
              ))}
            </div>
            <div ref={spaces.sentinelRef} aria-hidden="true" />
            {spaces.isFetchingNextPage && (
              <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                <SpaceCardSkeleton />
                <SpaceCardSkeleton />
                <SpaceCardSkeleton />
              </div>
            )}
          </>
        )}
      </section>

      <CreateSpaceDialog open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  );
}
