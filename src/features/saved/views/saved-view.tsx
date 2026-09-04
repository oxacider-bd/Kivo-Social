"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bookmark,
  BookmarkCheck,
  FolderPlus,
  Loader2,
  MoreVertical,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { navigateTo } from "@/lib/router";
import { cn } from "@/lib/utils";
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
import type { CollectionDTO, Page, PostDTO } from "@/types";

/** GET /api/saved returns a Page<PostDTO> plus the viewer's total saved count. */
type SavedPage = Page<PostDTO> & { total?: number };

// ─── Cover collage ───────────────────────────────────────────────────────────

function Collage({ urls, name }: { urls: string[]; name: string }) {
  if (!urls.length) {
    return (
      <div
        aria-hidden
        className="flex h-full w-full items-center justify-center bg-gradient-to-br from-brand-soft via-accent to-brand-soft"
      >
        <Bookmark className="h-8 w-8 text-brand/40" />
      </div>
    );
  }
  return (
    <div className={cn("grid h-full w-full gap-px bg-border/50", urls.length === 1 ? "grid-cols-1" : "grid-cols-2")}>
      {urls.slice(0, 3).map((u, i) => (
        <img
          key={u}
          src={u}
          alt={i === 0 ? `Preview of collection ${name}` : ""}
          loading="lazy"
          className={cn("h-full w-full bg-muted object-cover", urls.length === 3 && i === 0 && "col-span-2")}
        />
      ))}
    </div>
  );
}

// ─── Main view ───────────────────────────────────────────────────────────────

export default function SavedView() {
  const queryClient = useQueryClient();

  const strip = useQuery({
    queryKey: ["saved-strip"],
    queryFn: ({ signal }) => api<SavedPage>("/api/saved?limit=3", { signal }),
  });
  const collections = useQuery({
    queryKey: ["collections"],
    queryFn: ({ signal }) => api<CollectionDTO[]>("/api/collections", { signal }),
  });

  // dialog state: create + rename share one dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [renaming, setRenaming] = useState<CollectionDTO | null>(null);
  const [name, setName] = useState("");
  const [deleting, setDeleting] = useState<CollectionDTO | null>(null);

  const saveMutation = useMutation({
    mutationFn: async (payload: { mode: "create" } | { mode: "rename"; id: string }) => {
      if (payload.mode === "create") {
        return api<CollectionDTO>("/api/collections", { body: { name: name.trim() } });
      }
      return api<CollectionDTO>(`/api/collections/${payload.id}`, {
        method: "PATCH",
        body: { name: name.trim() },
      });
    },
    onSuccess: (collection, payload) => {
      toast(payload.mode === "create" ? `Collection “${collection.name}” created.` : "Collection renamed.");
      setDialogOpen(false);
      setRenaming(null);
      setName("");
      void queryClient.invalidateQueries({ queryKey: ["collections"] });
      void queryClient.invalidateQueries({ queryKey: ["saved-collection"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Could not save the collection. Try again."),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api<{ deleted: boolean }>(`/api/collections/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast("Collection deleted. Posts stay saved in All saved.");
      setDeleting(null);
      void queryClient.invalidateQueries({ queryKey: ["collections"] });
      void queryClient.invalidateQueries({ queryKey: ["saved-strip"] });
      void queryClient.invalidateQueries({ queryKey: ["saved-collection"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Could not delete the collection. Try again."),
  });

  const totalSaved = strip.data?.total ?? 0;
  const stripThumbs = (strip.data?.items ?? [])
    .map((p) => p.media[0]?.url ?? p.link?.image ?? null)
    .filter((u): u is string => !!u)
    .slice(0, 3);

  function openCreate() {
    setRenaming(null);
    setName("");
    setDialogOpen(true);
  }
  function openRename(c: CollectionDTO) {
    setRenaming(c);
    setName(c.name);
    setDialogOpen(true);
  }

  return (
    <div className="flex flex-col gap-6 pb-10">
      {/* Header */}
      <header>
        <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">Saved</h1>
        <p className="mt-1 text-sm text-muted-foreground">Your personal corner of the internet.</p>
      </header>

      {/* All saved strip */}
      <button
        onClick={() => navigateTo("/saved/all")}
        className="group flex items-center gap-4 rounded-2xl border bg-card p-4 text-left outline-none card-shadow transition-all duration-200 hover:border-brand/40 hover:bg-accent/40 hover:shadow-sm focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.99]"
        aria-label="Open all saved posts"
      >
        <span
          aria-hidden
          className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand"
        >
          <BookmarkCheck className="h-7 w-7" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-bold">All saved</span>
          <span className="block text-sm text-muted-foreground">
            {strip.isLoading ? "Counting…" : `${totalSaved} post${totalSaved === 1 ? "" : "s"} · everything you've bookmarked`}
          </span>
        </span>
        <span aria-hidden className="hidden gap-1 sm:flex">
          {stripThumbs.length ? (
            stripThumbs.map((u) => (
              <img
                key={u}
                src={u}
                alt=""
                loading="lazy"
                className="h-12 w-12 rounded-lg border border-border/60 bg-muted object-cover transition-transform duration-200 group-hover:scale-[1.03]"
              />
            ))
          ) : (
            Array.from({ length: 3 }).map((_, i) => (
              <span
                key={i}
                className="h-12 w-12 rounded-lg border border-dashed bg-muted/40"
              />
            ))
          )}
        </span>
      </button>

      {/* Collections grid */}
      <section aria-labelledby="collections-heading">
        <div className="mb-3 flex items-center justify-between">
          <h2 id="collections-heading" className="text-lg font-bold tracking-tight">
            Collections
          </h2>
        </div>

        {collections.isLoading ? (
          <div aria-hidden className="grid grid-cols-2 gap-4 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i}>
                <div className="skeleton aspect-[4/3] w-full rounded-xl" />
                <div className="skeleton mt-2 h-4 w-2/3 rounded-md" />
                <div className="skeleton mt-1.5 h-3 w-1/3 rounded-md" />
              </div>
            ))}
          </div>
        ) : collections.isError ? (
          <ErrorState
            description="Collections didn't load."
            action={
              <Button variant="outline" size="sm" onClick={() => void collections.refetch()}>
                Try again
              </Button>
            }
          />
        ) : (collections.data ?? []).length === 0 ? (
          <EmptyState
            icon={<FolderPlus className="h-10 w-10" aria-hidden />}
            title="No collections yet."
            description="Collections are neat stacks of saved posts — group recipes, reads, or mood boards."
            action={
              <Button
                onClick={openCreate}
                className="rounded-full font-semibold active:scale-[0.98]"
              >
                <Plus className="h-4 w-4" aria-hidden />
                New collection
              </Button>
            }
          />
        ) : (
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
            {(collections.data ?? []).map((c) => (
              <div key={c.id} className="group relative">
                <button
                  onClick={() => navigateTo(`/saved/${c.id}`)}
                  className="block w-full rounded-xl text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label={`Open collection ${c.name}, ${c.postCount} posts`}
                >
                  <div className="aspect-[4/3] overflow-hidden rounded-xl border bg-card transition-all duration-200 group-hover:border-brand/40 group-hover:shadow-sm">
                    <Collage urls={c.coverUrls} name={c.name} />
                  </div>
                  <div className="mt-2 px-0.5">
                    <p className="truncate text-sm font-semibold">{c.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {c.postCount} post{c.postCount === 1 ? "" : "s"}
                    </p>
                  </div>
                </button>
                <div className="absolute right-2 top-2">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="secondary"
                        size="icon"
                        className="h-9 w-9 rounded-full border bg-card/90 opacity-0 shadow-sm transition-opacity focus-visible:opacity-100 group-hover:opacity-100 data-[state=open]:opacity-100"
                        aria-label={`Options for collection ${c.name}`}
                      >
                        <MoreVertical className="h-4 w-4" aria-hidden />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-44">
                      <DropdownMenuItem onClick={() => openRename(c)}>
                        <Pencil className="h-4 w-4" aria-hidden /> Rename
                      </DropdownMenuItem>
                      <DropdownMenuItem variant="destructive" onClick={() => setDeleting(c)}>
                        <Trash2 className="h-4 w-4" aria-hidden /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            ))}

            {/* New collection card */}
            <button
              onClick={openCreate}
              className="flex min-h-44 flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed text-muted-foreground outline-none transition-all duration-200 hover:border-brand/50 hover:bg-brand-soft/40 hover:text-brand active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Create a new collection"
            >
              <FolderPlus className="h-8 w-8" aria-hidden />
              <span className="text-sm font-semibold">New collection</span>
            </button>
          </div>
        )}
      </section>

      {strip.isError && !collections.isError && (
        <EmptyState
          icon={<Bookmark className="h-10 w-10" />}
          title="Saved posts didn't load"
          action={
            <Button variant="outline" size="sm" onClick={() => void strip.refetch()}>
              Try again
            </Button>
          }
        />
      )}

      {/* Create / rename dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) { setDialogOpen(false); setRenaming(null); } }}>
        <DialogContent className="rounded-2xl sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{renaming ? "Rename collection" : "New collection"}</DialogTitle>
          </DialogHeader>
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (!name.trim() || saveMutation.isPending) return;
              saveMutation.mutate(
                renaming ? { mode: "rename", id: renaming.id } : { mode: "create" },
              );
            }}
          >
            <div className="flex flex-col gap-2">
              <Label htmlFor="collection-name">Name</Label>
              <Input
                id="collection-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Design inspiration"
                maxLength={60}
                autoFocus
                required
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => { setDialogOpen(false); setRenaming(null); }}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={!name.trim() || saveMutation.isPending} className="active:scale-[0.98]">
                {saveMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                {renaming ? "Save" : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleting} onOpenChange={(open) => { if (!open) setDeleting(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{deleting?.name}”?</AlertDialogTitle>
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
                if (deleting) deleteMutation.mutate(deleting.id);
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
