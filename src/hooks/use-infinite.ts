"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useInfiniteQuery, type QueryKey } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Page } from "@/types";

/**
 * Infinite list loader with IntersectionObserver-based auto-fetch.
 * Returns flattened `items` plus a `sentinelRef` callback ref to place
 * on a div after the list (auto-fetches when it enters the viewport).
 */
export function useInfiniteList<T>(
  key: QueryKey,
  fetchPage: (cursor: string | null, signal: AbortSignal) => Promise<Page<T>>,
  opts?: { enabled?: boolean },
) {
  const query = useInfiniteQuery({
    queryKey: key,
    queryFn: ({ pageParam, signal }) => fetchPage(pageParam as string | null, signal),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    enabled: opts?.enabled,
  });

  // Latest fetch controls live outside render so the callback ref stays stable.
  const fetcherRef = useRef({ canFetch: false, fetchNext: () => {} });
  useEffect(() => {
    fetcherRef.current = {
      canFetch: Boolean(query.hasNextPage) && !query.isFetchingNextPage,
      fetchNext: () => void query.fetchNextPage(),
    };
  }, [query.hasNextPage, query.isFetchingNextPage, query.fetchNextPage]);

  const observerRef = useRef<IntersectionObserver | null>(null);

  const sentinelRef = useCallback((node: HTMLElement | null) => {
    observerRef.current?.disconnect();
    observerRef.current = null;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && fetcherRef.current.canFetch) {
          fetcherRef.current.fetchNext();
        }
      },
      { rootMargin: "600px 0px" },
    );
    observer.observe(node);
    observerRef.current = observer;
  }, []);

  useEffect(() => () => observerRef.current?.disconnect(), []);

  const items = query.data?.pages.flatMap((p) => p.items) ?? [];
  return { ...query, items, sentinelRef };
}

/** Debounced value for search inputs. */
export function useDebounced<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

/** Convenience page fetcher for the standard KIVO cursor API. */
export function makePageFetcher<T>(buildUrl: (cursor: string | null) => string) {
  return (cursor: string | null, signal: AbortSignal) =>
    api<Page<T>>(buildUrl(cursor), { signal });
}
