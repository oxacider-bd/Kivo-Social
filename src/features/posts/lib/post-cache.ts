"use client";

import type { QueryClient } from "@tanstack/react-query";
import type { PostDTO } from "@/types";

/**
 * Patches a single post inside every list query cache it might live in
 * (feed, space feeds, hashtag feeds...). Keeps PostCard / ThreadModal
 * optimistic updates in sync with the infinite lists that rendered them.
 */
export function patchPostInCaches(
  queryClient: QueryClient,
  postId: string,
  patch: (post: PostDTO) => PostDTO,
) {
  const keys: string[][] = [["feed"], ["space-posts"], ["hashtag-posts"], ["profile-posts"], ["saved-posts"]];
  for (const key of keys) {
    queryClient.setQueriesData<{ pages: { items: PostDTO[] }[]; pageParams: unknown[] }>(
      { queryKey: key },
      (data) => {
        if (!data) return data;
        let touched = false;
        const pages = data.pages.map((page) => {
          if (!page.items.some((p) => p.id === postId)) return page;
          touched = true;
          return {
            ...page,
            items: page.items.map((p) => (p.id === postId ? patch(p) : p)),
          };
        });
        return touched ? { ...data, pages } : data;
      },
    );
  }
}

/** Shorthand used when a server call returns a fresh PostDTO. */
export function replacePostInCaches(queryClient: QueryClient, post: PostDTO) {
  patchPostInCaches(queryClient, post.id, () => post);
}

/** Merges a partial reaction-toggle result into a cached PostDTO. */
export function applyReactionToggle(
  post: PostDTO,
  toggle: { counts: { reactions: number }; topReactions: { type: PostDTO["topReactions"][number]["type"]; count: number }[]; viewerReaction: PostDTO["viewerReaction"] },
): PostDTO {
  return {
    ...post,
    counts: { ...post.counts, reactions: toggle.counts.reactions },
    topReactions: toggle.topReactions,
    viewerReaction: toggle.viewerReaction,
  };
}
