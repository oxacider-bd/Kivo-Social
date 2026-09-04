"use client";

import { useEffect, useState } from "react";
import { Bookmark, FolderPlus, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { CollectionDTO, PostDTO } from "@/types";

/**
 * Bookmark button + save-to-collection dialog.
 * Unsaved click → dialog ("All saved", collections, create-new).
 * Saved click → dialog with a remove step, or move to another collection.
 * Optimistic: the bookmark flips immediately and rolls back on failure.
 */
export function SaveButton({
  post,
  onChange,
}: {
  post: PostDTO;
  onChange?: (saved: boolean) => void;
}) {
  const [saved, setSaved] = useState(post.viewerSaved);
  const [open, setOpen] = useState(false);
  const [collections, setCollections] = useState<CollectionDTO[]>([]);
  const [collectionsUnavailable, setCollectionsUnavailable] = useState(false);
  const [loadingCollections, setLoadingCollections] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setSaved(post.viewerSaved);
  }, [post.viewerSaved]);

  async function loadCollections() {
    setLoadingCollections(true);
    try {
      const data = await api<CollectionDTO[]>("/api/collections");
      setCollections(data);
      setCollectionsUnavailable(false);
    } catch (err) {
      // Collections service may not be wired yet — degrade gracefully.
      if (err instanceof ApiError && (err.code === "NOT_FOUND" || err.status === 404)) {
        setCollectionsUnavailable(true);
      } else if (!(err instanceof ApiError && err.status === 401)) {
        setCollectionsUnavailable(true);
      }
    } finally {
      setLoadingCollections(false);
    }
  }

  function openDialog() {
    setConfirmRemove(false);
    setNewName("");
    setOpen(true);
    void loadCollections();
  }

  async function doSave(body: { collectionId?: string | null; collectionName?: string }) {
    if (busy) return;
    setBusy(true);
    const prevSaved = saved;
    if (!saved) {
      setSaved(true);
      onChange?.(true);
    }
    try {
      await api(`/api/posts/${post.id}/save`, { method: "POST", body });
      toast.success(body.collectionName ? `Saved to “${body.collectionName}”` : "Saved to KIVO");
      setOpen(false);
    } catch (err) {
      setSaved(prevSaved);
      onChange?.(prevSaved);
      toast.error(err instanceof Error ? err.message : "Couldn't save this post. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function doUnsave() {
    if (busy) return;
    setBusy(true);
    const prevSaved = saved;
    setSaved(false);
    onChange?.(false);
    try {
      await api(`/api/posts/${post.id}/save`, { method: "DELETE" });
      toast("Removed from saved");
      setOpen(false);
      setConfirmRemove(false);
    } catch (err) {
      setSaved(prevSaved);
      onChange?.(prevSaved);
      toast.error(err instanceof Error ? err.message : "Couldn't remove this post. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function createAndSave() {
    const name = newName.trim();
    if (!name) {
      toast.error("Give your collection a name first.");
      return;
    }
    if (busy) return;
    setCreating(true);
    await doSave({ collectionName: name });
    setCreating(false);
    setNewName("");
  }

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        onClick={openDialog}
        aria-label={saved ? "Saved — manage or remove" : "Save post"}
        aria-pressed={saved}
        className="h-9 w-9 rounded-full text-muted-foreground hover:bg-brand-soft hover:text-brand active:scale-95"
      >
        <Bookmark
          className={cn(
            "h-[18px] w-[18px] transition-colors",
            saved && "fill-brand text-brand animate-pop",
          )}
        />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-[calc(100%-2rem)] rounded-xl p-0 sm:max-w-sm">
          {confirmRemove ? (
            <div className="p-6">
              <DialogHeader>
                <DialogTitle className="text-base">Remove from saved?</DialogTitle>
                <DialogDescription>
                  This post will disappear from your saved list.
                </DialogDescription>
              </DialogHeader>
              <div className="mt-5 flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setConfirmRemove(false)}>
                  Keep it
                </Button>
                <Button
                  variant="destructive"
                  className="flex-1"
                  onClick={doUnsave}
                  disabled={busy}
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  Remove
                </Button>
              </div>
            </div>
          ) : (
            <div className="max-h-[70vh] overflow-y-auto scrollbar-slim p-2">
              <div className="px-4 pt-3 pb-2">
                <DialogTitle className="text-base">Save post</DialogTitle>
                <DialogDescription className="mt-1 text-xs">
                  Keep it on your shelf, neatly organized.
                </DialogDescription>
              </div>

              <button
                type="button"
                onClick={() => doSave({ collectionId: null })}
                disabled={busy}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Bookmark className="h-4 w-4 text-brand" aria-hidden="true" />
                <span className="flex-1 text-sm font-medium">All saved</span>
                <span className="text-xs text-muted-foreground">default</span>
              </button>

              {loadingCollections && (
                <div className="flex items-center gap-2 px-4 py-3 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading collections…
                </div>
              )}

              {!loadingCollections && collections.length > 0 && (
                <div className="mt-1 border-t pt-1">
                  {collections.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => doSave({ collectionId: c.id })}
                      disabled={busy}
                      className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <FolderPlus className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                      <span className="min-w-0 flex-1 truncate text-sm">{c.name}</span>
                      <span className="text-xs text-muted-foreground">{c.postCount}</span>
                    </button>
                  ))}
                </div>
              )}

              {!loadingCollections && collectionsUnavailable && collections.length === 0 && (
                <p className="px-4 py-2 text-xs text-muted-foreground">
                  Your collections will appear here once saved posts are set up.
                </p>
              )}

              <div className="mt-1 border-t p-3">
                <div className="flex items-center gap-2">
                  <Input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="New collection name"
                    aria-label="New collection name"
                    maxLength={60}
                    className="h-9 flex-1 text-sm"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void createAndSave();
                      }
                    }}
                  />
                  <Button
                    size="sm"
                    className="h-9 gap-1"
                    onClick={() => void createAndSave()}
                    disabled={busy || creating || newName.trim().length === 0}
                    aria-label="Create collection and save post"
                  >
                    {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                    Create
                  </Button>
                </div>
              </div>

              {saved && (
                <div className="border-t p-3">
                  <Button
                    variant="ghost"
                    className="h-9 w-full justify-start gap-2 text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => setConfirmRemove(true)}
                  >
                    <Trash2 className="h-4 w-4" /> Remove from saved
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
