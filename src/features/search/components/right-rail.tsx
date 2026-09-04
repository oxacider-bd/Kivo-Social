"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, TrendingUp, Sparkles, ChevronRight } from "lucide-react";
import { api } from "@/lib/api";
import { navigateTo } from "@/lib/router";
import { formatCount } from "@/lib/format";
import { Input } from "@/components/ui/input";
import { ProfileMiniCard } from "@/components/profile-mini-card";
import type { ExploreDTO } from "@/types";

/**
 * Home right rail (xl screens): search box, trending hashtags, suggested people.
 * Self-contained — fetches /api/explore with react-query.
 */
export function RightRail() {
  const [q, setQ] = useState("");

  const explore = useQuery({
    queryKey: ["explore"],
    queryFn: ({ signal }) => api<ExploreDTO>("/api/explore", { signal }),
    staleTime: 30_000,
  });

  return (
    <div className="flex flex-col gap-6 pb-10">
      {/* Search */}
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          const v = q.trim();
          if (!v) return;
          navigateTo(`/explore?q=${encodeURIComponent(v)}`);
        }}
      >
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="h-10 rounded-full border bg-muted/50 pl-10 text-sm transition-all duration-200 focus-visible:border-brand/50 focus-visible:bg-card focus-visible:ring-2 focus-visible:ring-brand/15"
            placeholder="Search KIVO"
            aria-label="Search KIVO"
          />
        </div>
      </form>

      {/* Trending hashtags */}
      <section aria-labelledby="rail-trending" className="rounded-2xl border bg-card p-4 card-shadow">
        <div className="mb-1 flex items-center justify-between gap-2">
          <h2 id="rail-trending" className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <TrendingUp className="h-4 w-4 text-brand" aria-hidden />
            Trending
          </h2>
          <button
            type="button"
            onClick={() => navigateTo("/explore")}
            className="flex items-center gap-0.5 rounded-md text-xs font-medium text-muted-foreground outline-none transition-colors hover:text-brand focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="See all trending hashtags on Explore"
          >
            See all
            <ChevronRight className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>
        {explore.isLoading ? (
          <div className="flex flex-col" aria-hidden>
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between px-2 py-2.5">
                <div className="skeleton h-4 w-28 rounded-md" />
                <div className="skeleton h-3 w-10 rounded-md" />
              </div>
            ))}
          </div>
        ) : explore.isError ? (
          <p className="px-2 py-3 text-xs text-muted-foreground">
            Trends didn&apos;t load. Pull to refresh in a moment.
          </p>
        ) : !explore.data?.trendingHashtags.length ? (
          <p className="px-2 py-3 text-xs text-muted-foreground">
            No trends yet — be the first to post with a #hashtag.
          </p>
        ) : (
          <ul className="flex flex-col">
            {explore.data.trendingHashtags.map((h, i) => (
              <li key={h.tag}>
                <button
                  onClick={() => navigateTo(`/hashtag/${encodeURIComponent(h.tag)}`)}
                  className="group flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left outline-none transition-colors duration-150 hover:bg-accent/60 focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label={`Explore #${h.tag}, ${h.postCount} posts`}
                >
                  <span
                    aria-hidden
                    className="w-4 shrink-0 text-center text-xs font-semibold tabular-nums text-muted-foreground/60 transition-colors group-hover:text-brand"
                  >
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground transition-colors group-hover:text-brand">
                    #{h.tag}
                  </span>
                  <span className="shrink-0 pl-2 text-xs text-muted-foreground">
                    {formatCount(h.postCount)} posts
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Suggested for you */}
      <section aria-labelledby="rail-suggested" className="rounded-2xl border bg-card p-4 card-shadow">
        <div className="mb-1 flex items-center justify-between gap-2">
          <h2 id="rail-suggested" className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Sparkles className="h-4 w-4 text-brand" aria-hidden />
            Suggested for you
          </h2>
          <button
            type="button"
            onClick={() => navigateTo("/explore")}
            className="flex items-center gap-0.5 rounded-md text-xs font-medium text-muted-foreground outline-none transition-colors hover:text-brand focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="See all suggested people on Explore"
          >
            See all
            <ChevronRight className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>
        {explore.isLoading ? (
          <div aria-hidden>
            {Array.from({ length: 3 }).map((_, i) => (
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
          <p className="px-2 py-3 text-xs text-muted-foreground">
            You&apos;re following everyone worth following. Impressive.
          </p>
        ) : (
          <ul className="-mx-1 divide-y divide-border/60">
            {explore.data.suggestedUsers.slice(0, 4).map((p) => (
              <li key={p.id} className="px-1">
                <ProfileMiniCard profile={p} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Footer mini */}
      <p className="pt-2 text-center text-xs text-muted-foreground">KIVO — Social, but cleaner.</p>
    </div>
  );
}
