"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Search,
  X,
  Hash,
  Loader2,
  TrendingUp,
  Sparkles,
  Flame,
  SearchX,
  Users as UsersIcon,
  MessageSquare,
} from "lucide-react";
import { api } from "@/lib/api";
import { navigateTo, useHashRoute } from "@/lib/router";
import { useDebounced, useInfiniteList } from "@/hooks/use-infinite";
import { formatCount } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { EmptyState, ErrorState } from "@/components/empty-state";
import { ProfileMiniCard } from "@/components/profile-mini-card";
import { UserAvatar } from "@/components/user-avatar";
import { SpaceResultCard } from "@/features/search/components/space-result-card";
import { PostCard, PostCardSkeleton } from "@/features/posts/components/post-card";
import type {
  ExploreDTO,
  HashtagDTO,
  Page,
  PostDTO,
  ProfileCardDTO,
  SearchResultsDTO,
  SpaceDTO,
} from "@/types";

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Extracts the raw query string from a hash-router path like "/explore?q=kivo". */
function queryFromPath(path: string): string {
  const qs = path.split("?")[1] ?? "";
  return new URLSearchParams(qs).get("q")?.trim() ?? "";
}

function withCursor(url: string, cursor: string | null): string {
  return cursor ? `${url}&cursor=${encodeURIComponent(cursor)}` : url;
}

// ─── Paginated result tabs ───────────────────────────────────────────────────

function PeopleResults({ q }: { q: string }) {
  const list = useInfiniteList<ProfileCardDTO>(["search-people", q], (cursor, signal) =>
    api<Page<ProfileCardDTO>>(
      withCursor(`/api/search/people?q=${encodeURIComponent(q)}&limit=20`, cursor),
      { signal },
    ),
  );
  const { items, sentinelRef, isFetchingNextPage, isLoading, isError, refetch } = list;

  if (isLoading) {
    return (
      <div aria-hidden className="flex flex-col gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 rounded-xl border bg-card p-3">
            <div className="skeleton h-10 w-10 rounded-full" />
            <div className="flex-1 space-y-1.5">
              <div className="skeleton h-3.5 w-32 rounded-md" />
              <div className="skeleton h-3 w-24 rounded-md" />
            </div>
            <div className="skeleton h-8 w-20 rounded-full" />
          </div>
        ))}
      </div>
    );
  }
  if (isError) {
    return (
      <ErrorState
        description="We couldn't load people results."
        action={
          <Button variant="outline" size="sm" onClick={() => void refetch()}>
            Try again
          </Button>
        }
      />
    );
  }
  if (!items.length) {
    return (
      <EmptyState
        icon={<UsersIcon className="h-10 w-10" />}
        title={`No people match “${q}”`}
        description="Check the spelling, or try a different name or @username."
      />
    );
  }
  return (
    <div className="flex flex-col gap-2">
      {items.map((p) => (
        <div key={p.id} className="rounded-xl border bg-card px-3 card-shadow">
          <ProfileMiniCard profile={p} />
        </div>
      ))}
      <div ref={sentinelRef} aria-hidden />
      {isFetchingNextPage && (
        <div className="flex justify-center py-4">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}
    </div>
  );
}

function PostsResults({ q }: { q: string }) {
  const list = useInfiniteList<PostDTO>(["search-posts", q], (cursor, signal) =>
    api<Page<PostDTO>>(
      withCursor(`/api/search/posts?q=${encodeURIComponent(q)}&limit=10`, cursor),
      { signal },
    ),
  );
  const { items, sentinelRef, isFetchingNextPage, isLoading, isError, refetch } = list;

  if (isLoading) {
    return (
      <div aria-hidden className="flex flex-col gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <PostCardSkeleton key={i} />
        ))}
      </div>
    );
  }
  if (isError) {
    return (
      <ErrorState
        description="We couldn't load post results."
        action={
          <Button variant="outline" size="sm" onClick={() => void refetch()}>
            Try again
          </Button>
        }
      />
    );
  }
  if (!items.length) {
    return (
      <EmptyState
        icon={<SearchX className="h-10 w-10" />}
        title={`No posts match “${q}”`}
        description="Try broader keywords — or start the conversation yourself."
      />
    );
  }
  return (
    <div className="flex flex-col gap-4">
      {items.map((post) => (
        <PostCard key={post.id} post={post} />
      ))}
      <div ref={sentinelRef} aria-hidden />
      {isFetchingNextPage && (
        <div className="flex justify-center py-4">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}
    </div>
  );
}

function SpacesResults({ q }: { q: string }) {
  const list = useInfiniteList<SpaceDTO>(["search-spaces", q], (cursor, signal) =>
    api<Page<SpaceDTO>>(
      withCursor(`/api/search/spaces?q=${encodeURIComponent(q)}&limit=10`, cursor),
      { signal },
    ),
  );
  const { items, sentinelRef, isFetchingNextPage, isLoading, isError, refetch } = list;

  if (isLoading) {
    return (
      <div aria-hidden className="flex flex-col gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 rounded-xl border bg-card p-3">
            <div className="skeleton h-11 w-11 rounded-xl" />
            <div className="flex-1 space-y-1.5">
              <div className="skeleton h-3.5 w-36 rounded-md" />
              <div className="skeleton h-3 w-24 rounded-md" />
            </div>
            <div className="skeleton h-8 w-20 rounded-full" />
          </div>
        ))}
      </div>
    );
  }
  if (isError) {
    return (
      <ErrorState
        description="We couldn't load space results."
        action={
          <Button variant="outline" size="sm" onClick={() => void refetch()}>
            Try again
          </Button>
        }
      />
    );
  }
  if (!items.length) {
    return (
      <EmptyState
        icon={<Sparkles className="h-10 w-10" />}
        title={`No spaces match “${q}”`}
        description="Maybe you should create it — communities start with one person."
      />
    );
  }
  return (
    <div className="flex flex-col gap-2">
      {items.map((s) => (
        <SpaceResultCard key={s.id} space={s} />
      ))}
      <div ref={sentinelRef} aria-hidden />
      {isFetchingNextPage && (
        <div className="flex justify-center py-4">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}
    </div>
  );
}

function HashtagsResults({ q }: { q: string }) {
  const list = useInfiniteList<HashtagDTO>(["search-hashtags", q], (cursor, signal) =>
    api<Page<HashtagDTO>>(
      withCursor(`/api/search/hashtags?q=${encodeURIComponent(q)}&limit=15`, cursor),
      { signal },
    ),
  );
  const { items, sentinelRef, isFetchingNextPage, isLoading, isError, refetch } = list;

  if (isLoading) {
    return (
      <div aria-hidden className="flex flex-wrap gap-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="skeleton h-9 w-28 rounded-full" />
        ))}
      </div>
    );
  }
  if (isError) {
    return (
      <ErrorState
        description="We couldn't load hashtag results."
        action={
          <Button variant="outline" size="sm" onClick={() => void refetch()}>
            Try again
          </Button>
        }
      />
    );
  }
  if (!items.length) {
    return (
      <EmptyState
        icon={<Hash className="h-10 w-10" />}
        title={`No hashtags match “${q}”`}
        description="Use a #hashtag in your next post to plant the flag."
      />
    );
  }
  return (
    <>
      <div className="flex flex-wrap gap-2">
        {items.map((h) => (
          <HashtagChip key={h.tag} tag={h.tag} postCount={h.postCount} />
        ))}
      </div>
      <div ref={sentinelRef} aria-hidden />
      {isFetchingNextPage && (
        <div className="flex justify-center py-4">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}
    </>
  );
}

// ─── Hashtag chip (shared by trending + search results) ─────────────────────

function HashtagChip({ tag, postCount }: { tag: string; postCount: number }) {
  return (
    <button
      onClick={() => navigateTo(`/hashtag/${encodeURIComponent(tag)}`)}
      className="flex min-h-11 items-center gap-1.5 rounded-full border bg-card px-4 py-2 text-sm outline-none transition-all duration-200 hover:border-brand/50 hover:bg-brand-soft/60 hover:shadow-sm active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-ring"
      aria-label={`Explore #${tag}, ${postCount} posts`}
    >
      <span className="font-semibold text-brand">#{tag}</span>
      <span className="text-xs text-muted-foreground">{formatCount(postCount)}</span>
    </button>
  );
}

// ─── Instant dropdown ────────────────────────────────────────────────────────

function InstantPanel({
  dq,
  onNavigate,
}: {
  dq: string;
  onNavigate: () => void;
}) {
  const instant = useQuery({
    queryKey: ["instant", dq],
    queryFn: ({ signal }) =>
      api<SearchResultsDTO>(`/api/search/instant?q=${encodeURIComponent(dq)}`, { signal }),
    enabled: dq.length >= 1,
    staleTime: 10_000,
    placeholderData: (prev) => prev,
  });

  const go = useCallback(
    (to: string) => {
      onNavigate();
      navigateTo(to);
    },
    [onNavigate],
  );

  const data = instant.data;
  const total =
    (data?.people.length ?? 0) +
    (data?.spaces.length ?? 0) +
    (data?.hashtags.length ?? 0) +
    (data?.posts.length ?? 0);
  const loading = instant.isFetching && !data;

  return (
    <div
      role="dialog"
      aria-label="Search suggestions"
      className="animate-pop absolute inset-x-0 top-[calc(100%+8px)] z-50 max-h-[70vh] overflow-y-auto scrollbar-slim rounded-2xl border bg-popover p-2 text-popover-foreground card-shadow"
    >
      {loading ? (
        <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Searching…
        </div>
      ) : !data || total === 0 ? (
        <div className="flex flex-col items-center gap-1 py-6 text-center">
          <SearchX className="h-6 w-6 text-muted-foreground/60" aria-hidden />
          <p className="text-sm font-semibold">No results for “{dq}”</p>
          <p className="text-xs text-muted-foreground">Try a different word or check the spelling.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          {data.people.length > 0 && (
            <section aria-label="People results">
              <p className="px-3 pb-1 pt-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                People
              </p>
              {data.people.map((p) => (
                <button
                  key={p.id}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left outline-none transition-colors duration-150 hover:bg-accent/60 focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => go(`/profile/${p.username}`)}
                  aria-label={`Go to ${p.fullName}'s profile`}
                >
                  <UserAvatar
                    username={p.username}
                    fullName={p.fullName}
                    avatarUrl={p.avatarUrl}
                    size={36}
                    linkToProfile={false}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{p.fullName}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      @{p.username}
                    </span>
                  </span>
                </button>
              ))}
            </section>
          )}

          {data.spaces.length > 0 && (
            <section aria-label="Space results">
              <p className="px-3 pb-1 pt-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                Spaces
              </p>
              {data.spaces.map((s) => (
                <button
                  key={s.id}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left outline-none transition-colors duration-150 hover:bg-accent/60 focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => go(`/spaces/${s.slug}`)}
                  aria-label={`Go to space ${s.name}`}
                >
                  <span
                    aria-hidden
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-xs font-bold text-brand"
                  >
                    {s.name.slice(0, 2).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{s.name}</span>
                    <span className="block text-xs text-muted-foreground">
                      {formatCount(s.counts.members)} members
                    </span>
                  </span>
                </button>
              ))}
            </section>
          )}

          {data.hashtags.length > 0 && (
            <section aria-label="Hashtag results">
              <p className="px-3 pb-1 pt-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                Hashtags
              </p>
              {data.hashtags.map((h) => (
                <button
                  key={h.tag}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left outline-none transition-colors duration-150 hover:bg-accent/60 focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => go(`/hashtag/${encodeURIComponent(h.tag)}`)}
                  aria-label={`Go to hashtag ${h.tag}`}
                >
                  <Hash className="h-4 w-4 shrink-0 text-brand" aria-hidden />
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold">#{h.tag}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {formatCount(h.postCount)} posts
                  </span>
                </button>
              ))}
            </section>
          )}

          {data.posts.length > 0 && (
            <section aria-label="Post results">
              <p className="px-3 pb-1 pt-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                Posts
              </p>
              {data.posts.map((p) => (
                <button
                  key={p.id}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left outline-none transition-colors duration-150 hover:bg-accent/60 focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => go(`/profile/${p.author.username}`)}
                  aria-label={`Post by ${p.author.fullName}: ${p.content.slice(0, 80)}`}
                >
                  <MessageSquare className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="min-w-0 flex-1 truncate text-sm">
                    <span className="font-semibold">{p.author.fullName}</span>{" "}
                    <span className="text-muted-foreground">
                      {p.content.replace(/\s+/g, " ").slice(0, 90)}
                    </span>
                  </span>
                </button>
              ))}
            </section>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Discovery sections (no query) ───────────────────────────────────────────

function TrendingChips({ hashtags }: { hashtags: HashtagDTO[] }) {
  if (!hashtags.length) {
    return (
      <p className="text-sm text-muted-foreground">
        Nothing is trending yet — post with a #hashtag to get things going.
      </p>
    );
  }
  return (
    <div className="flex flex-wrap gap-2">
      {hashtags.map((h) => (
        <HashtagChip key={h.tag} tag={h.tag} postCount={h.postCount} />
      ))}
    </div>
  );
}

// ─── Explore view ────────────────────────────────────────────────────────────

type ResultsTab = "people" | "posts" | "spaces" | "hashtags";

export default function ExploreView() {
  const { path } = useHashRoute();
  const q = queryFromPath(path);

  const [input, setInput] = useState(q);
  const [panelOpen, setPanelOpen] = useState(false);
  const [tab, setTab] = useState<ResultsTab>("people");
  const containerRef = useRef<HTMLDivElement>(null);

  // Keep the input in sync when the URL query changes (nav from rail, etc.)
  useEffect(() => {
    setInput(q);
  }, [q]);

  const dq = useDebounced(input.trim(), 300);

  // Close the instant panel on outside pointer-down
  useEffect(() => {
    if (!panelOpen) return;
    function onDown(e: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setPanelOpen(false);
      }
    }
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [panelOpen]);

  const explore = useQuery({
    queryKey: ["explore"],
    queryFn: ({ signal }) => api<ExploreDTO>("/api/explore", { signal }),
    staleTime: 30_000,
  });

  const submitSearch = useCallback(
    (value: string) => {
      const v = value.trim();
      if (!v) return;
      setPanelOpen(false);
      navigateTo(`/explore?q=${encodeURIComponent(v)}`);
    },
    [],
  );

  const showPanel = panelOpen && dq.length >= 1;

  const resultTabs = useMemo(
    () =>
      [
        { value: "people", label: "People" },
        { value: "posts", label: "Posts" },
        { value: "spaces", label: "Spaces" },
        { value: "hashtags", label: "Hashtags" },
      ] as const,
    [],
  );

  return (
    <div className="flex min-h-full flex-col">
      {/* Sticky search header */}
      <div className="glass sticky top-14 z-30 -mx-3 border-b px-3 py-3 md:top-0 md:-mx-6 md:px-6">
        <div ref={containerRef} className="relative mx-auto w-full max-w-[640px]">
          <form
            role="search"
            onSubmit={(e) => {
              e.preventDefault();
              submitSearch(input);
            }}
          >
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  if (e.target.value.trim()) setPanelOpen(true);
                }}
                onFocus={() => {
                  if (input.trim()) setPanelOpen(true);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    setPanelOpen(false);
                    e.currentTarget.blur();
                  }
                }}
                type="search"
                className="h-12 rounded-full border bg-muted/50 pl-12 pr-11 text-[15px] transition-all duration-200 focus-visible:border-brand/50 focus-visible:bg-card focus-visible:ring-2 focus-visible:ring-brand/15"
                placeholder="Search people, posts, spaces, hashtags…"
                aria-label="Search KIVO"
                role="combobox"
                aria-expanded={showPanel}
                aria-controls="kivo-instant-results"
                autoComplete="off"
              />
              {input && (
                <button
                  type="button"
                  onClick={() => {
                    setInput("");
                    setPanelOpen(false);
                    if (q) navigateTo("/explore");
                  }}
                  className="absolute right-2.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label="Clear search"
                >
                  <X className="h-4 w-4" aria-hidden />
                </button>
              )}
            </div>
          </form>
          {showPanel && <InstantPanel dq={dq} onNavigate={() => setPanelOpen(false)} />}
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col pt-5">
        {q ? (
          <Tabs
            value={tab}
            onValueChange={(v) => setTab(v as ResultsTab)}
            className="flex flex-1 flex-col"
          >
            <TabsList className="mb-4 flex w-full justify-start gap-6 overflow-x-auto scrollbar-none rounded-none border-b bg-transparent p-0 sm:w-auto">
              {resultTabs.map((t) => (
                <TabsTrigger
                  key={t.value}
                  value={t.value}
                  className="h-auto flex-none rounded-none border-0 border-b-2 border-transparent bg-transparent px-1 pb-2.5 pt-1 text-sm font-medium text-muted-foreground shadow-none transition-colors duration-150 hover:text-foreground data-[state=active]:border-brand data-[state=active]:bg-transparent data-[state=active]:font-semibold data-[state=active]:text-foreground data-[state=active]:shadow-none dark:data-[state=active]:border-brand dark:data-[state=active]:bg-transparent"
                >
                  {t.label}
                </TabsTrigger>
              ))}
            </TabsList>
            <p className="mb-4 text-sm text-muted-foreground">
              Results for <span className="font-semibold text-foreground">“{q}”</span>
            </p>
            <TabsContent value="people" className="mt-0 flex-1">
              <PeopleResults q={q} />
            </TabsContent>
            <TabsContent value="posts" className="mt-0 flex-1">
              <PostsResults q={q} />
            </TabsContent>
            <TabsContent value="spaces" className="mt-0 flex-1">
              <SpacesResults q={q} />
            </TabsContent>
            <TabsContent value="hashtags" className="mt-0 flex-1">
              <HashtagsResults q={q} />
            </TabsContent>
          </Tabs>
        ) : (
          <div className="flex flex-col gap-6">
            {/* Hero */}
            <header className="animate-rise">
              <h1 className="text-2xl font-bold tracking-tight">Explore</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                What the community is talking about right now.
              </p>
            </header>

            {/* Trending hashtags */}
            <section aria-labelledby="explore-trending">
              <h2
                id="explore-trending"
                className="mb-3 flex items-center gap-2 text-lg font-bold tracking-tight"
              >
                <TrendingUp className="h-5 w-5 text-brand" aria-hidden />
                Trending hashtags
              </h2>
              {explore.isLoading ? (
                <div aria-hidden className="flex flex-wrap gap-2">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="skeleton h-11 w-28 rounded-full" />
                  ))}
                </div>
              ) : explore.isError ? (
                <ErrorState
                  description="Trends didn't load."
                  action={
                    <Button variant="outline" size="sm" onClick={() => void explore.refetch()}>
                      Try again
                    </Button>
                  }
                />
              ) : (
                <TrendingChips hashtags={explore.data?.trendingHashtags ?? []} />
              )}
            </section>

            {/* Suggested people */}
            <section aria-labelledby="explore-people">
              <h2
                id="explore-people"
                className="mb-1 flex items-center gap-2 text-lg font-bold tracking-tight"
              >
                <Sparkles className="h-5 w-5 text-brand" aria-hidden />
                Suggested people
              </h2>
              {explore.isLoading ? (
                <div aria-hidden className="grid gap-x-6 sm:grid-cols-2">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-3 py-2">
                      <div className="skeleton h-10 w-10 rounded-full" />
                      <div className="flex-1 space-y-1.5">
                        <div className="skeleton h-3.5 w-28 rounded-md" />
                        <div className="skeleton h-3 w-20 rounded-md" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : explore.isError ? null : !explore.data?.suggestedUsers.length ? (
                <p className="text-sm text-muted-foreground">
                  You already follow everyone we&apos;d suggest. Well done!
                </p>
              ) : (
                <div className="grid gap-x-6 sm:grid-cols-2">
                  {explore.data.suggestedUsers.map((p) => (
                    <ProfileMiniCard key={p.id} profile={p} />
                  ))}
                </div>
              )}
            </section>

            {/* Popular right now */}
            <section aria-labelledby="explore-popular">
              <h2
                id="explore-popular"
                className="mb-3 flex items-center gap-2 text-lg font-bold tracking-tight"
              >
                <Flame className="h-5 w-5 text-brand" aria-hidden />
                Popular right now
              </h2>
              {explore.isLoading ? (
                <div aria-hidden className="flex flex-col gap-4">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <PostCardSkeleton key={i} />
                  ))}
                </div>
              ) : explore.isError ? (
                <ErrorState
                  description="Popular posts didn't load."
                  action={
                    <Button variant="outline" size="sm" onClick={() => void explore.refetch()}>
                      Try again
                    </Button>
                  }
                />
              ) : !explore.data?.popularPosts.length ? (
                <EmptyState
                  icon={<Flame className="h-10 w-10" />}
                  title="Nothing's heating up yet"
                  description="Be the spark — share something worth reacting to."
                />
              ) : (
                <div className={cn("flex flex-col gap-4")}>
                  {explore.data.popularPosts.map((post: PostDTO) => (
                    <PostCard key={post.id} post={post} />
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
