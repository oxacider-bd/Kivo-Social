"use client";

import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  BarChart3,
  Image as ImageIcon,
  Loader2,
  Plus,
  Trash2,
  Type,
  Video,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { MOMENT_BACKGROUNDS } from "@/lib/constants";
import { uploadMedia } from "@/lib/upload";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { MomentDTO } from "@/types";

type ComposerTab = "text" | "image" | "video" | "poll";

const TABS: { id: ComposerTab; label: string; icon: typeof Type }[] = [
  { id: "text", label: "Text", icon: Type },
  { id: "image", label: "Photo", icon: ImageIcon },
  { id: "video", label: "Video", icon: Video },
  { id: "poll", label: "Poll", icon: BarChart3 },
];

const MAX_CHARS = 280;

/** Dialog for composing a 24h moment: text / photo / video / poll. */
export function MomentComposer({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<ComposerTab>("text");
  const [content, setContent] = useState("");
  const [background, setBackground] = useState<string>(MOMENT_BACKGROUNDS[0].id);
  const [media, setMedia] = useState<{ url: string; type: "image" | "video" } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [options, setOptions] = useState<string[]>(["", ""]);
  const [submitting, setSubmitting] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const queryClient = useQueryClient();

  // Reset whenever the dialog closes so it opens fresh next time.
  useEffect(() => {
    if (open) return;
    setTab("text");
    setContent("");
    setBackground(MOMENT_BACKGROUNDS[0].id);
    setMedia(null);
    setOptions(["", ""]);
  }, [open]);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    try {
      const res = await uploadMedia(file, "moment");
      setMedia({ url: res.url, type: res.type });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed. Please try again.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const filledOptions = options.map((o) => o.trim()).filter(Boolean);
  const canShare =
    (tab === "text" && content.trim().length > 0) ||
    ((tab === "image" || tab === "video") && !!media) ||
    (tab === "poll" && content.trim().length > 0 && filledOptions.length >= 2);

  async function share() {
    if (!canShare || submitting) return;
    setSubmitting(true);
    const body: Record<string, unknown> =
      tab === "text"
        ? { type: "text", content: content.trim(), background }
        : tab === "poll"
          ? { type: "poll", content: content.trim(), poll: { options: filledOptions } }
          : { type: tab, content: content.trim(), mediaUrl: media?.url, mediaType: tab };
    try {
      await api<MomentDTO>("/api/moments", { body });
      toast.success("Moment shared — it vanishes in 24h");
      void queryClient.invalidateQueries({ queryKey: ["moments"] });
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't share your moment.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="overflow-hidden rounded-2xl p-0 sm:max-w-lg">
        <DialogHeader className="px-5 pt-5">
          <DialogTitle>New moment</DialogTitle>
          <DialogDescription className="sr-only">
            Create a moment that disappears in 24 hours.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 px-5 pb-5">
          {/* Segmented control */}
          <div className="flex rounded-full bg-muted p-1" role="tablist" aria-label="Moment type">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  "flex h-8 flex-1 items-center justify-center gap-1.5 rounded-full text-[13px] font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  tab === t.id
                    ? "bg-background shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <t.icon className="h-4 w-4" aria-hidden="true" />
                {t.label}
              </button>
            ))}
          </div>

          {/* Text */}
          {tab === "text" && (
            <>
              <div
                className={cn(
                  "rounded-2xl transition-colors",
                  MOMENT_BACKGROUNDS.find((b) => b.id === background)?.className,
                )}
              >
                <Textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value.slice(0, MAX_CHARS))}
                  placeholder="What's happening?"
                  rows={4}
                  maxLength={MAX_CHARS}
                  aria-label="Moment text"
                  className="resize-none border-0 bg-transparent text-base font-medium text-white placeholder:text-white/70 focus-visible:ring-0"
                />
              </div>
              <div className="flex items-center justify-between gap-3">
                <div className="flex gap-2" role="radiogroup" aria-label="Background">
                  {MOMENT_BACKGROUNDS.map((b) => (
                    <button
                      key={b.id}
                      type="button"
                      role="radio"
                      aria-checked={background === b.id}
                      aria-label={`Background: ${b.id}`}
                      onClick={() => setBackground(b.id)}
                      className={cn(
                        "h-7 w-7 shrink-0 rounded-full transition",
                        b.className,
                        background === b.id
                          ? "ring-2 ring-brand ring-offset-2 ring-offset-background"
                          : "opacity-80 hover:opacity-100",
                      )}
                    />
                  ))}
                </div>
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                  {content.length}/{MAX_CHARS}
                </span>
              </div>
            </>
          )}

          {/* Photo / Video */}
          {(tab === "image" || tab === "video") && (
            <>
              <input
                ref={fileRef}
                type="file"
                accept={tab === "image" ? "image/*" : "video/*"}
                className="hidden"
                onChange={(e) => void handleFile(e.target.files?.[0])}
                aria-hidden="true"
                tabIndex={-1}
              />
              {media ? (
                <div className="relative overflow-hidden rounded-2xl border">
                  {media.type === "image" ? (
                    <img
                      src={media.url}
                      alt="Moment preview"
                      className="max-h-64 w-full object-cover"
                    />
                  ) : (
                    <video src={media.url} className="max-h-64 w-full" muted controls />
                  )}
                  <button
                    type="button"
                    onClick={() => setMedia(null)}
                    aria-label="Remove media"
                    className="absolute right-2 top-2 flex h-9 w-9 items-center justify-center rounded-full bg-black/60 text-white transition hover:bg-black/80"
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  className="flex h-40 w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed text-muted-foreground transition hover:border-brand/50 hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {uploading ? (
                    <Loader2 className="h-6 w-6 animate-spin" aria-hidden="true" />
                  ) : (
                    <>
                      {tab === "image" ? (
                        <ImageIcon className="h-6 w-6" aria-hidden="true" />
                      ) : (
                        <Video className="h-6 w-6" aria-hidden="true" />
                      )}
                      <span className="text-sm font-medium">
                        {tab === "image" ? "Choose a photo" : "Choose a video"}
                      </span>
                      <span className="text-xs opacity-70">Visible for 24 hours</span>
                    </>
                  )}
                </button>
              )}
              <Textarea
                value={content}
                onChange={(e) => setContent(e.target.value.slice(0, MAX_CHARS))}
                placeholder="Add a caption (optional)"
                rows={2}
                maxLength={MAX_CHARS}
                aria-label="Caption"
                className="resize-none"
              />
            </>
          )}

          {/* Poll */}
          {tab === "poll" && (
            <div className="space-y-3">
              <Input
                value={content}
                onChange={(e) => setContent(e.target.value.slice(0, MAX_CHARS))}
                placeholder="Ask a question…"
                maxLength={MAX_CHARS}
                aria-label="Poll question"
              />
              {options.map((opt, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    value={opt}
                    onChange={(e) =>
                      setOptions((prev) =>
                        prev.map((o, j) => (j === i ? e.target.value.slice(0, 80) : o)),
                      )
                    }
                    placeholder={`Option ${i + 1}`}
                    maxLength={80}
                    aria-label={`Option ${i + 1}`}
                  />
                  {options.length > 2 && (
                    <button
                      type="button"
                      onClick={() => setOptions((prev) => prev.filter((_, j) => j !== i))}
                      aria-label={`Remove option ${i + 1}`}
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                  )}
                </div>
              ))}
              {options.length < 4 && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="rounded-full"
                  onClick={() => setOptions((prev) => [...prev, ""])}
                >
                  <Plus className="h-4 w-4" aria-hidden="true" /> Add option
                </Button>
              )}
            </div>
          )}

          <Button
            type="button"
            className="w-full rounded-full font-semibold active:scale-[0.98]"
            disabled={!canShare || uploading || submitting}
            onClick={() => void share()}
          >
            {submitting && <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" />}
            Share moment
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            Moments disappear 24 hours after they&apos;re shared.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
