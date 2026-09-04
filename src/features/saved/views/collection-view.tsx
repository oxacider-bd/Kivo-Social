"use client";

import { useCallback, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { InfiniteData } from "@tanstack/react-query";
import {
  ArrowLeft,
  Bookmark,
  BookmarkX,
  Loader2,
  MoreVertical,
  Pencil,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { navigateTo } from "@/lib/router";
import { useInfiniteList } from "@/hooks/use-infinite";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState, ErrorState } from "@/components/empty-state";
import { PostCard, PostCardSkeleton } from "@/features/posts/components/post-card";
import type { CollectionDTO, Page, PostDTO } from "@/types";

/** GET /api/saved returns a Page<PostDTO> plus the viewer's total saved count. */
type SavedPage = Page<PostDTO> & { total?: number };
/** GET /api/collections/:id returns { collection, posts }; we flatten posts + carry collection. */
type CollectionPage = Page<PostDTO> & { collection?: CollectionDTO };

/**
 * A single saved collection — or the special "all" pseudo-collection (every saved post).
 */
export default function CollectionView({ collectionId }: { collectionId: string }) {
  const isAll = collectionId === "all";
  const listKey = ["saved-collection", collectionId] as const;
  const queryClient = useQueryClient();

  const list = useInfiniteList<PostDTO>(listKey, (cursor, signal): Promise<Page<PostDTO>> => {
    const cursorPart = cursor ? `&cursor=${encodeURIComponent(cursor)}` : "";
    if (isAll) {
      return api<SavedPage>(`/api/saved?limit=10${cursorPart}`, { signal });
    }
    return api<{ collection: CollectionDTO; posts: Page<PostDTO> }>(
      `/api/collections/${encodeURIComponent(collectionId)}?limit=10${cursorPart}`,
      { signal },
    ).then((res) => ({ ...res.posts, collection: res.collection }));
  });
  const { data, items, sentinelRef, isFetchingNextPage, isLoading, isError, refetch } = list;

  const collection = (data?.pages[0] as CollectionPage | undefined)?.collection;
  const total = isAll
    ? (data?.pages[0] as SavedPage | undefined)?.total
    : collection?.postCount;
  const title = isAll ? "All saved" : (collection?.name ?? "Collection");

  // ── Local removal (optimistic) ────────────────────────────────────────────
  const removeLocal = useCallback(
    (id: string) => {
      queryClient.setQueryData<InfiniteData<Page<PostDTO>>>(listKey, (old) =>
        old
          ? {
              ...old,
              pages: old.pages.map((p) => ({
                ...p,
                items: p.items.filter((item) => item.id !== id),
              })),
            }
          : old,
      );
    },
    [queryClient, listKey],
  );

  const refreshCounts = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["saved-collection"] });
    void queryClient.invalidateQueries({ queryKey: ["saved-strip"] });
    void queryClient.invalidateQueries({ queryKey: ["collections"] });
  }, [queryClient]);

  // Explicit unsave affordance (calls agent 2-a's DELETE /api/posts/:id/save)
  const [removingId, setRemovingId] = useState<string | null>(null);
  const unsave = useCallback(
    async (id: string) => {
      setRemovingId(id);
      removeLocal(id);
      try {
        await api(`/api/posts/${encodeURIComponent(id)}/save`, { method: "DELETE" });
        toast("Removed from saved.");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not remove the post. Try again.");
      } finally {
        setRemovingId(null);
        refreshCounts();
      }
    },
    [removeLocal, refreshCounts],
  );

  // ── Rename / delete (real collections only) ──────────────────────────────
  const [renameOpen, setRenameOpen] = useState(false);
  const [name, setName] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);

  const renameMutation = useMutation({
    mutationFn: () =>
      api<CollectionDTO>(`/api/collections/${encodeURIComponent(collectionId)}`, {
        method: "PATCH",
        body: { name: name.trim() },
      }),
    onSuccess: () => {
      toast("Collection renamed.");
      setRenameOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["collections"] });
      void queryClient.invalidateQueries({ queryKey: listKey });
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : "Could not rename the collection. Try again."),
  });

  const deleteMutation = useMutation({
    mutationFn: () =>
      api<{ deleted: boolean }>(`/api/collections/${encodeURIComponent(collectionId)}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      toast("Collection deleted. Posts stay saved in All saved.");
      void queryClient.invalidateQueries({ queryKey: ["collections"] });
      void queryClient.invalidateQueries({ queryKey: ["saved-strip"] });
      void queryClient.invalidateQueries({ queryKey: ["saved-collection"] });
      navigateTo("/saved");
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : "Could not delete the collection. Try again."),
  });

  return (
    <div className="flex flex-col gap-5 pb-10">
      {/* Header */}
      <header className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="h-10 w-10 shrink-0 rounded-full"
          onClick={() => navigateTo("/saved")}
          aria-label="Back to saved"
        >
          <ArrowLeft className="h-5 w-5" aria-hidden />
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-extrabold tracking-tight sm:text-2xl">{title}</h1>
          <p className="text-sm text-muted-foreground">
            {isLoading
              ? "Counting posts…"
              : `${total ?? items.length} post${(total ?? items.length) === 1 ? "" : "s"}`}
          </p>
        </div>
        {!isAll && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-10 w-10 rounded-full"
                aria-label={`Options for ${title}`}
              >
                <MoreVertical className="h-5 w-5" aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem
                onClick={() => {
                  setName(collection?.name ?? "");
                  setRenameOpen(true);
                }}
              >
                <Pencil className="h-4 w-4" aria-hidden /> Rename
              </DropdownMenuItem>
              <DropdownMenuItem variant="destructive" onClick={() => setDeleteOpen(true)}>
                <Trash2 className="h-4 w-4" aria-hidden /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </header>

      {/* Posts */}
      {isLoading ? (
        <div aria-hidden className="flex flex-col gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <PostCardSkeleton key={i} />
          ))}
        </div>
      ) : isError ? (
        <ErrorState
          description="We couldn't load this collection."
          action={
            <Button variant="outline" size="sm" onClick={() => void refetch()}>
              Try again
            </Button>
          }
        />
      ) : !items.length ? (
        <EmptyState
          icon={<Bookmark className="h-10 w-10" />}
          title={isAll ? "Nothing saved yet." : `“${title}” is empty.`}
          description={
            isAll
              ? "Tap the bookmark on any post to keep it here."
              : "Tap the bookmark on any post to keep it here — then move it into this collection."
          }
          action={
            <Button variant="outline" className="rounded-full" onClick={() => navigateTo("/explore")}>
              Explore posts
            </Button>
          }
        />
      ) : (
        <>
          <div className="flex flex-col gap-4">
            {items.map((post) => (
              <div key={post.id} className="relative">
                <PostCard
                  post={post}
                  onPostChanged={(updated) => {
                    // PostCard's SaveButton unsaved it — drop it from the list.
                    if (!updated.viewerSaved) removeLocal(updated.id);
                  }}
                  onPostDeleted={(id) => {
                    removeLocal(id);
                    refreshCounts();
                  }}
                />
                <div className="mt-1 flex justify-end">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-9 rounded-full px-3 text-xs font-semibold text-muted-foreground hover:text-foreground"
                    onClick={() => void unsave(post.id)}
                    disabled={removingId === post.id}
                    aria-label={`Remove this post from ${title}`}
                  >
                    {removingId === post.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                    ) : (
                      <BookmarkX className="h-3.5 w-3.5" aria-hidden />
                    )}
                    Remove from {isAll ? "saved" : "collection"}
                  </Button>
                </div>
              </div>
            ))}
          </div>
          <div ref={sentinelRef} aria-hidden />
          {isFetchingNextPage && (
            <div className="flex justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}
        </>
      )}

      {/* Rename dialog */}
      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent className="rounded-2xl sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Rename collection</DialogTitle>
          </DialogHeader>
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (!name.trim() || renameMutation.isPending) return;
              renameMutation.mutate();
            }}
          >
            <div className="flex flex-col gap-2">
              <Label htmlFor="rename-collection">Name</Label>
              <Input
                id="rename-collection"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={60}
                autoFocus
                required
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setRenameOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={!name.trim() || renameMutation.isPending} className="active:scale-[0.98]">
                {renameMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                Save
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{title}”?</AlertDialogTitle>
            <AlertDialogDescription>
              Posts stay saved in All saved — only the collection is removed. This can&apos;t be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                deleteMutation.mutate();
              }}
            >
              {deleteMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
