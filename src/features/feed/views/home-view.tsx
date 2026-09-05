"use client";
/* eslint-disable react-hooks/refs -- useInfiniteList returns sentinelRef mixed with plain react-query state; reads below are query state, and sentinelRef is only ever attached to a DOM node (its documented contract). */

import { useState } from "react";
import { Compass, Sparkles } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState } from "@/components/empty-state";
import { ComposerForm } from "@/features/posts/components/post-composer";
import { PostCard, PostCardSkeleton } from "@/features/posts/components/post-card";
import { ThreadModal } from "@/features/comments/components/thread-modal";
import { MomentsRow } from "@/features/moments/components/moments-row";
import { useInfiniteList } from "@/hooks/use-infinite";
import { api } from "@/lib/api";
import { useSession } from "@/lib/session-store";
import { navigateTo } from "@/lib/router";
import { replacePostInCaches } from "@/features/posts/lib/post-cache";
import type { Page, PostDTO } from "@/types";

/**
 * The home feed: moments rail, inline composer, infinite post list and the
 * thread modal. Post mutations patch the react-query cache in place so the
 * list never refetches for a single tap.
 */
export default function HomeView() {
  const queryClient = useQueryClient();
  const { status } = useSession();
  const [threadPost, setThreadPost] = useState<PostDTO | null>(null);
  const [threadOpen, setThreadOpen] = useState(false);

  const feed = useInfiniteList<PostDTO>(["feed"], (cursor, signal) =>
    api<Page<PostDTO>>(`/api/feed?${cursor ? `cursor=${cursor}&` : ""}limit=8`, { signal }),
  );

  function openThread(post: PostDTO) {
    setThreadPost(post);
    setThreadOpen(true);
  }

  function handlePostChanged(updated: PostDTO) {
    // PostCard optimistically patched its own copy — persist the change into
    // every cached list so other views stay in sync.
    replacePostInCaches(queryClient, updated);
    setThreadPost((cur) => (cur && cur.id === updated.id ? updated : cur));
  }

  function handlePostDeleted(id: string) {
    for (const key of ["feed", "space-posts"] as const) {
      queryClient.setQueriesData<{ pages: { items: PostDTO[] }[]; pageParams: unknown[] }>(
        { queryKey: [key] },
        (data) =>
          data
            ? { ...data, pages: data.pages.map((p) => ({ ...p, items: p.items.filter((x) => x.id !== id) })) }
            : data,
      );
    }
    if (threadPost?.id === id) {
      setThreadOpen(false);
      setThreadPost(null);
    }
  }

  if (status === "unauthenticated") return null;

  return (
    <div className="mx-auto w-full max-w-xl space-y-6 px-0 py-4 sm:px-2">
      <MomentsRow />

      <section aria-label="Create a post">
        <ComposerForm compact />
      </section>

      <section aria-label="Feed" className="space-y-4">
        {feed.isLoading ? (
          <>
            <PostCardSkeleton />
            <PostCardSkeleton />
            <PostCardSkeleton />
          </>
        ) : feed.isError ? (
          <ErrorState
            title="Your feed couldn't load"
            description="Give it another moment and try again."
            action={
              <Button
                variant="outline"
                className="rounded-full"
                onClick={() =>
                  void (async () => {
                    // While degraded, the app cookie is missing — re-run the
                    // bridge once (single request) before refetching the feed.
                    if (useSession.getState().bridgeDegraded) {
                      await useSession.getState().resyncBridge();
                    }
                    await feed.refetch();
                  })()
                }
              >
                Try again
              </Button>
            }
          />
        ) : feed.items.length === 0 ? (
          <EmptyState
            icon={<Sparkles className="h-8 w-8" />}
            title="Your feed is quiet."
            description="Follow people or create your first post to get started."
            action={
              <Button className="rounded-full" onClick={() => navigateTo("/explore")}>
                <Compass className="h-4 w-4" aria-hidden="true" />
                Explore KIVO
              </Button>
            }
          />
        ) : (
          <>
            {feed.items.map((post) => (
              <PostCard
                key={post.id}
                post={post}
                onOpenThread={openThread}
                onPostChanged={handlePostChanged}
                onPostDeleted={handlePostDeleted}
              />
            ))}
            {feed.isFetchingNextPage && <PostCardSkeleton />}
            <div ref={feed.sentinelRef} aria-hidden="true" className="h-px" />
            {!feed.hasNextPage && feed.items.length > 0 && (
              <p className="py-6 text-center text-xs text-muted-foreground">
                You&apos;re all caught up ✨
              </p>
            )}
          </>
        )}
      </section>

      <ThreadModal
        post={threadPost}
        open={threadOpen}
        onClose={() => {
          setThreadOpen(false);
          setThreadPost(null);
        }}
      />
    </div>
  );
}
