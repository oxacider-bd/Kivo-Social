"use client";

import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Image as ImageIcon, Loader2, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { navigateTo } from "@/lib/router";
import { initials } from "@/lib/format";
import { uploadMedia } from "@/lib/upload";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { SpaceDTO } from "@/types";

/** Dialog for creating a space; navigates to it on success. */
export function CreateSpaceDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState<"avatar" | "cover" | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const avatarRef = useRef<HTMLInputElement | null>(null);
  const coverRef = useRef<HTMLInputElement | null>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (open) return;
    setName("");
    setDescription("");
    setAvatarUrl(null);
    setCoverUrl(null);
  }, [open]);

  async function upload(file: File | undefined, which: "avatar" | "cover") {
    if (!file) return;
    setUploading(which);
    try {
      const res = await uploadMedia(
        file,
        which,
        which === "avatar" ? { maxDimension: 512 } : undefined,
      );
      if (which === "avatar") setAvatarUrl(res.url);
      else setCoverUrl(res.url);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed. Please try again.");
    } finally {
      setUploading(null);
      if (which === "avatar" && avatarRef.current) avatarRef.current.value = "";
      if (which === "cover" && coverRef.current) coverRef.current.value = "";
    }
  }

  const canSubmit = name.trim().length >= 3 && !submitting && !uploading;

  async function submit() {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const space = await api<SpaceDTO>("/api/spaces", {
        body: {
          name: name.trim(),
          description: description.trim(),
          avatarUrl,
          coverUrl,
        },
      });
      toast.success("Space created");
      void queryClient.invalidateQueries({ queryKey: ["spaces"] });
      onClose();
      navigateTo(`/spaces/${space.slug}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't create the space.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="overflow-hidden rounded-2xl p-0 sm:max-w-lg">
        <DialogHeader className="px-5 pt-5">
          <DialogTitle>Create a space</DialogTitle>
          <DialogDescription>
            Gather your people around a topic you love.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 px-5 pb-5">
          {/* Cover */}
          <input
            ref={coverRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => void upload(e.target.files?.[0], "cover")}
            aria-hidden="true"
            tabIndex={-1}
          />
          <input
            ref={avatarRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => void upload(e.target.files?.[0], "avatar")}
            aria-hidden="true"
            tabIndex={-1}
          />

          <button
            type="button"
            onClick={() => coverRef.current?.click()}
            disabled={uploading === "cover"}
            className="relative flex h-24 w-full items-center justify-center overflow-hidden rounded-xl border-2 border-dashed text-muted-foreground transition hover:border-brand/50 hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Upload a cover image"
          >
            {coverUrl ? (
               
              <img src={coverUrl} alt="Cover preview" className="h-full w-full object-cover" />
            ) : (
              <span className="flex items-center gap-2 text-sm font-medium">
                {uploading === "cover" ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <ImageIcon className="h-4 w-4" aria-hidden="true" />
                )}
                Add a cover (optional)
              </span>
            )}
            {coverUrl && (
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  setCoverUrl(null);
                }}
                role="button"
                tabIndex={0}
                aria-label="Remove cover"
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.stopPropagation();
                    setCoverUrl(null);
                  }
                }}
                className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white transition hover:bg-black/80"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </span>
            )}
          </button>

          {/* Avatar */}
          <div className="-mt-8 flex items-end gap-3 pl-1">
            <button
              type="button"
              onClick={() => avatarRef.current?.click()}
              disabled={uploading === "avatar"}
              className="relative flex h-16 w-16 items-center justify-center overflow-hidden rounded-full border-4 border-background bg-brand-soft text-lg font-bold text-brand shadow-sm transition hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Upload a space avatar"
            >
              {avatarUrl ? (
                 
                <img src={avatarUrl} alt="Avatar preview" className="h-full w-full object-cover" />
              ) : uploading === "avatar" ? (
                <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
              ) : (
                <>
                  {initials(name) || <Plus className="h-5 w-5" aria-hidden="true" />}
                </>
              )}
            </button>
            <span className="pb-1 text-xs text-muted-foreground">
              Add an avatar (optional)
            </span>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="space-name">Name</Label>
            <Input
              id="space-name"
              value={name}
              onChange={(e) => setName(e.target.value.slice(0, 40))}
              placeholder="e.g. Ember Run Club"
              maxLength={40}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="space-description">Description</Label>
            <Textarea
              id="space-description"
              value={description}
              onChange={(e) => setDescription(e.target.value.slice(0, 300))}
              placeholder="What is this space about?"
              rows={3}
              maxLength={300}
              className="resize-none"
            />
            <p className="text-right text-xs tabular-nums text-muted-foreground">
              {description.length}/300
            </p>
          </div>

          <Button
            type="button"
            className="w-full rounded-full font-semibold active:scale-[0.98]"
            disabled={!canSubmit}
            onClick={() => void submit()}
          >
            {submitting && <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" />}
            Create space
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
