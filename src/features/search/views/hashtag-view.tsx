"use client";

import { useState } from "react";
import { Hash, Loader2, Plus } from "lucide-react";
import { api } from "@/lib/api";
import { useInfiniteList } from "@/hooks/use-infinite";
import { formatCount } from "@/lib/format";
import { useComposer } from "@/lib/ui-store";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState, ErrorState } from "@/components/empty-state";
import { PostCard, PostCardSkeleton } from "@/features/posts/components/post-card";
import type { Page, PostDTO } from "@/types";

type TagTab = "popular" | "recent";

/** Page payload from GET /api/hashtags/:tag — a Page<PostDTO> plus the tag meta. */
type HashtagTagPayload = { tag: string; postCount: number; page: Page<PostDTO> };
type HashtagPage = Page<PostDTO> & { postCount?: number };

/**
 * Hashtag page: header with tag meta + Popular/Recent tabs and a paginated post feed.
 */
export default function HashtagView({ tag }: { tag: string }) {
  const [tab, setTab] = useState<TagTab>("popular");
  const openComposer = useComposer((s) => s.openComposer);

  const list = useInfiniteList<PostDTO>(
    ["hashtag", tag, tab],
    (cursor, signal) => {
      const base = `/api/hashtags/${encodeURIComponent(tag)}?tab=${tab}&limit=10`;
      return api<HashtagTagPayload>(cursor ? `${base}&cursor=${encodeURIComponent(cursor)}` : base, {
        signal,
      }).then((payload) => ({ ...payload.page, postCount: payload.postCount }) as HashtagPage);
    },
    { enabled: tag.length > 0 },
  );
  const { data, items, sentinelRef, isFetchingNextPage, hasNextPage, isLoading, isError, refetch } = list;

  // postCount rides along on every page response; read it from the first page.
  const postCount = (data?.pages[0] as HashtagPage | undefined)?.postCount ?? 0;

  return (
    <div className="flex flex-col gap-6 pb-10">
      {/* Header card */}
      <section
        aria-labelledby="hashtag-title"
        className="rounded-2xl border bg-card p-6 card-shadow"
      >
        <div className="flex items-start gap-4">
          <span
            aria-hidden
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-brand-soft text-brand"
          >
            <Hash className="h-7 w-7" />
          </span>
          <div className="min-w-0 flex-1">
            <h1
              id="hashtag-title"
              className="truncate text-2xl font-bold tracking-tight sm:text-3xl"
            >
              #{tag}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {isLoading ? "Counting posts…" : `${formatCount(postCount)} posts`}
            </p>
          </div>
        </div>

        <Tabs value={tab} onValueChange={(v) => setTab(v as TagTab)} className="mt-5">
          <TabsList className="h-auto justify-start gap-6 rounded-none border-b bg-transparent p-0">
            <TabsTrigger
              value="popular"
              className="h-auto flex-none rounded-none border-0 border-b-2 border-transparent bg-transparent px-1 pb-2.5 pt-1 text-sm font-medium text-muted-foreground shadow-none transition-colors duration-150 hover:text-foreground data-[state=active]:border-brand data-[state=active]:bg-transparent data-[state=active]:font-semibold data-[state=active]:text-foreground data-[state=active]:shadow-none dark:data-[state=active]:border-brand dark:data-[state=active]:bg-transparent"
            >
              Popular
            </TabsTrigger>
            <TabsTrigger
              value="recent"
              className="h-auto flex-none rounded-none border-0 border-b-2 border-transparent bg-transparent px-1 pb-2.5 pt-1 text-sm font-medium text-muted-foreground shadow-none transition-colors duration-150 hover:text-foreground data-[state=active]:border-brand data-[state=active]:bg-transparent data-[state=active]:font-semibold data-[state=active]:text-foreground data-[state=active]:shadow-none dark:data-[state=active]:border-brand dark:data-[state=active]:bg-transparent"
            >
              Recent
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </section>

      {/* Feed */}
      {isLoading ? (
        <div aria-hidden className="flex flex-col gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <PostCardSkeleton key={i} />
          ))}
        </div>
      ) : isError ? (
        <ErrorState
          description={`We couldn't load posts for #${tag}.`}
          action={
            <Button variant="outline" size="sm" onClick={() => void refetch()}>
              Try again
            </Button>
          }
        />
      ) : !items.length ? (
        <EmptyState
          icon={<Hash className="h-10 w-10" />}
          title={`No posts with #${tag} yet`}
          description="Start the conversation — the first post sets the tone."
          action={
            <Button onClick={() => openComposer()} className="rounded-full font-semibold active:scale-[0.98]">
              <Plus className="h-4 w-4" aria-hidden />
              Create a post
            </Button>
          }
        />
      ) : (
        <>
          <div className="flex flex-col gap-4">
            {items.map((post) => (
              <PostCard key={post.id} post={post} />
            ))}
          </div>
          <div ref={sentinelRef} aria-hidden />
          {isFetchingNextPage && (
            <div className="flex justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}
          {!hasNextPage && items.length > 3 && (
            <p className="pb-2 text-center text-xs text-muted-foreground">
              That&apos;s every #{tag} post so far.
            </p>
          )}
        </>
      )}

    </div>
  );
}
