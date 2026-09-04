"use client";

import { useRef, useState, type ReactNode } from "react";
import {
  Globe,
  Image as ImageIcon,
  Link2,
  Loader2,
  Lock,
  Plus,
  Smile,
  Sparkles,
  Trash2,
  Users,
  X,
  BarChart3,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { UserAvatar } from "@/components/user-avatar";
import { api } from "@/lib/api";
import { FEELINGS, MAX_POST_CHARS } from "@/lib/constants";
import { uploadMedia, type UploadedMedia } from "@/lib/upload";
import { useSession } from "@/lib/session-store";
import { cn } from "@/lib/utils";
import type { Privacy } from "@/types";

const AI_TONES = [
  { id: "professional", label: "Professional" },
  { id: "friendly", label: "Friendly" },
  { id: "funny", label: "Funny" },
  { id: "emotional", label: "Emotional" },
  { id: "short", label: "Short" },
] as const;

export interface ComposerFormProps {
  compact?: boolean;
  spacePreset?: { id: string; name: string } | null;
  onPosted?: () => void;
}

/**
 * The KIVO composer — text, photos, polls, feelings, links, privacy and a
 * sprinkle of AI. Used inline on the feed (compact) and inside the modal.
 */
export function ComposerForm({ compact = false, spacePreset = null, onPosted }: ComposerFormProps) {
  const { user } = useSession();
  const queryClient = useQueryClient();
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [expanded, setExpanded] = useState(!compact);
  const [content, setContent] = useState("");
  const [privacy, setPrivacy] = useState<Privacy>("PUBLIC");
  const [feeling, setFeeling] = useState<string | null>(null);
  const [media, setMedia] = useState<UploadedMedia[]>([]);
  const [uploadingCount, setUploadingCount] = useState(0);
  const [pollOptions, setPollOptions] = useState<string[] | null>(null);
  const [showLinkInput, setShowLinkInput] = useState(false);
  const [linkInput, setLinkInput] = useState("");
  const [linkUrl, setLinkUrl] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // AI state
  const [aiBusy, setAiBusy] = useState(false);
  const [aiDialogOpen, setAiDialogOpen] = useState(false);
  const [aiContext, setAiContext] = useState("");
  const [aiSuggestions, setAiSuggestions] = useState<string[]>([]);
  const [aiNote, setAiNote] = useState<string | null>(null);

  function expand() {
    setExpanded(true);
    requestAnimationFrame(() => textareaRef.current?.focus());
  }

  function autoResize(el: HTMLTextAreaElement) {
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 260)}px`;
  }

  function reset() {
    setContent("");
    setFeeling(null);
    setMedia([]);
    setPollOptions(null);
    setLinkUrl(null);
    setLinkInput("");
    setShowLinkInput(false);
    setAiSuggestions([]);
    setAiNote(null);
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    if (compact) setExpanded(false);
  }

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const slots = 4 - media.length;
    if (slots <= 0) {
      toast.error("Up to 4 photos per post.");
      return;
    }
    const picked = Array.from(files).slice(0, slots);
    setUploadingCount((n) => n + picked.length);
    for (const file of picked) {
      try {
        const uploaded = await uploadMedia(file, "post");
        setMedia((m) => (m.length < 4 ? [...m, uploaded] : m));
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "That file couldn't be uploaded.");
      } finally {
        setUploadingCount((n) => Math.max(0, n - 1));
      }
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function addLink() {
    const raw = linkInput.trim();
    if (!raw) return;
    try {
      const url = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
      if (!["http:", "https:"].includes(url.protocol)) throw new Error("bad protocol");
      setLinkUrl(url.toString());
      setLinkInput("");
    } catch {
      toast.error("That link doesn't look right. Paste a full URL.");
    }
  }

  const pollReady =
    pollOptions !== null &&
    pollOptions.filter((o) => o.trim().length > 0).length >= 2;
  const canSubmit =
    !submitting &&
    (content.trim().length > 0 || media.length > 0 || linkUrl || pollReady);

  async function submit() {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      await api("/api/posts", {
        method: "POST",
        body: {
          content: content.trim(),
          privacy,
          feeling,
          linkUrl,
          media: media.map((m) => ({ url: m.url, type: m.type, width: m.width, height: m.height })),
          poll: pollOptions ? { options: pollOptions.map((o) => o.trim()).filter(Boolean) } : undefined,
          spaceId: spacePreset?.id ?? null,
        },
      });
      toast.success(spacePreset ? `Shared with ${spacePreset.name}` : "Posted to KIVO");
      reset();
      void queryClient.invalidateQueries({ queryKey: ["feed"] });
      if (spacePreset) void queryClient.invalidateQueries({ queryKey: ["space-posts"] });
      onPosted?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Your post couldn't be published. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  // ─── AI helpers (graceful until the AI service is live) ────────────────────

  async function aiGenerateCaption() {
    if (aiBusy) return;
    setAiBusy(true);
    setAiSuggestions([]);
    setAiNote(null);
    try {
      const res = await api<{ suggestions?: string[]; text?: string }>("/api/ai/caption", {
        method: "POST",
        body: { context: aiContext.trim() },
      });
      const suggestions = res.suggestions ?? (res.text ? [res.text] : []);
      if (suggestions.length === 0) throw new Error("empty");
      setAiSuggestions(suggestions);
    } catch {
      setAiNote("AI is warming up — try again shortly.");
      toast("AI is warming up, try again shortly");
    } finally {
      setAiBusy(false);
    }
  }

  async function aiImprove(tone: string) {
    if (aiBusy) return;
    const text = content.trim();
    if (!text) {
      toast.error("Write a little first, then let AI polish it.");
      return;
    }
    setAiBusy(true);
    setAiSuggestions([]);
    setAiNote(null);
    try {
      const res = await api<{ suggestions?: string[]; text?: string }>("/api/ai/improve", {
        method: "POST",
        body: { text, tone },
      });
      const suggestions = res.suggestions ?? (res.text ? [res.text] : []);
      if (suggestions.length === 0) throw new Error("empty");
      setAiSuggestions(suggestions);
      setAiNote(`Tone: ${AI_TONES.find((t) => t.id === tone)?.label ?? tone}`);
    } catch {
      setAiNote("AI is warming up — try again shortly.");
      toast("AI is warming up, try again shortly");
    } finally {
      setAiBusy(false);
    }
  }

  function applySuggestion(text: string) {
    setContent(text.slice(0, MAX_POST_CHARS));
    setAiSuggestions([]);
    setAiNote(null);
    requestAnimationFrame(() => {
      if (textareaRef.current) autoResize(textareaRef.current);
      textareaRef.current?.focus();
    });
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  if (!expanded) {
    return (
      <div className="rounded-2xl border bg-card p-4 card-shadow sm:p-5">
        <button
          type="button"
          onClick={expand}
          className="flex w-full items-center gap-3 rounded-xl text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Write a post"
        >
          <UserAvatar
            username={user?.profile.username ?? "you"}
            fullName={user?.profile.fullName ?? "You"}
            avatarUrl={user?.profile.avatarUrl}
            size={40}
            linkToProfile={false}
          />
          <span className="flex-1 rounded-full bg-muted px-4 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-accent">
            What&apos;s happening?
          </span>
        </button>
      </div>
    );
  }

  return (
    <div className={cn("p-4 sm:p-5", compact && "rounded-2xl border bg-card card-shadow")}>
      <div className="flex items-start gap-3">
        <UserAvatar
          username={user?.profile.username ?? "you"}
          fullName={user?.profile.fullName ?? "You"}
          avatarUrl={user?.profile.avatarUrl}
          size={40}
          linkToProfile={false}
        />
        <div className="min-w-0 flex-1">
          {(feeling || spacePreset || linkUrl || pollOptions !== null) && (
            <div className="mb-2 flex flex-wrap items-center gap-1.5">
              {pollOptions !== null && (
                <span className="flex items-center gap-1 rounded-full bg-brand-soft px-2.5 py-1 text-xs text-brand">
                  <BarChart3 className="h-3 w-3" aria-hidden="true" />
                  Poll
                  <button
                    type="button"
                    onClick={() => setPollOptions(null)}
                    aria-label="Remove poll"
                    className="rounded-full outline-none hover:text-destructive focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              )}
              {feeling && (
                <span className="flex items-center gap-1 rounded-full bg-brand-soft px-2.5 py-1 text-xs text-brand">
                  Feeling {feeling}
                  <button
                    type="button"
                    onClick={() => setFeeling(null)}
                    aria-label="Remove feeling"
                    className="rounded-full outline-none hover:text-destructive focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              )}
              {spacePreset && (
                <span className="flex items-center gap-1 rounded-full border border-brand/30 bg-brand-soft px-2.5 py-1 text-xs font-medium text-brand">
                  <Users className="h-3 w-3" aria-hidden="true" />
                  {spacePreset.name}
                </span>
              )}
              {linkUrl && (
                <span className="flex max-w-full items-center gap-1 rounded-full bg-brand-soft px-2.5 py-1 text-xs text-brand">
                  <Link2 className="h-3 w-3 shrink-0" aria-hidden="true" />
                  <span className="max-w-[180px] truncate">{safeHost(linkUrl)}</span>
                  <button
                    type="button"
                    onClick={() => setLinkUrl(null)}
                    aria-label="Remove link"
                    className="rounded-full outline-none hover:text-destructive focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              )}
            </div>
          )}
          <Textarea
            ref={textareaRef}
            value={content}
            onChange={(e) => {
              setContent(e.target.value.slice(0, MAX_POST_CHARS));
              autoResize(e.target);
            }}
            placeholder="What's happening?"
            aria-label="Post text"
            rows={2}
            className="resize-none border-none bg-transparent px-0 text-[16px] shadow-none focus-visible:ring-0"
          />

          {/* Poll builder */}
          {pollOptions !== null && (
            <div className="mt-2 rounded-xl border bg-muted/40 p-3">
              <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                <BarChart3 className="h-3.5 w-3.5" aria-hidden="true" /> Poll options
              </p>
              <div className="space-y-2">
                {pollOptions.map((opt, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input
                      value={opt}
                      onChange={(e) =>
                        setPollOptions((opts) =>
                          opts ? opts.map((o, j) => (j === i ? e.target.value.slice(0, 80) : o)) : opts,
                        )
                      }
                      placeholder={`Option ${i + 1}`}
                      aria-label={`Poll option ${i + 1}`}
                      maxLength={80}
                      className="h-9 bg-card text-sm"
                    />
                    {pollOptions.length > 2 && (
                      <button
                        type="button"
                        onClick={() => setPollOptions((opts) => (opts ? opts.filter((_, j) => j !== i) : opts))}
                        aria-label={`Remove poll option ${i + 1}`}
                        className="rounded-full p-1.5 text-muted-foreground outline-none hover:bg-accent hover:text-destructive focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <div className="mt-2 flex items-center gap-2">
                {pollOptions.length < 4 && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1 rounded-full text-xs"
                    onClick={() => setPollOptions((opts) => (opts ? [...opts, ""] : opts))}
                  >
                    <Plus className="h-3.5 w-3.5" /> Add option
                  </Button>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 rounded-full text-xs text-muted-foreground"
                  onClick={() => setPollOptions(null)}
                >
                  Remove poll
                </Button>
              </div>
            </div>
          )}

          {/* Media thumbnails */}
          {(media.length > 0 || uploadingCount > 0) && (
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {media.map((m, i) => (
                <div key={m.url} className="group relative aspect-square overflow-hidden rounded-lg border bg-muted">
                  {m.type === "image" ? (
                     
                    <img src={m.url} alt={`Attachment ${i + 1}`} className="h-full w-full object-cover" />
                  ) : (
                    <video src={m.url} className="h-full w-full object-cover" muted aria-label={`Video attachment ${i + 1}`} />
                  )}
                  <button
                    type="button"
                    onClick={() => setMedia((arr) => arr.filter((_, j) => j !== i))}
                    aria-label={`Remove attachment ${i + 1}`}
                    className="absolute top-1 right-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white outline-none transition-colors hover:bg-destructive focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
              {Array.from({ length: uploadingCount }).map((_, i) => (
                <div key={`uploading-${i}`} className="flex aspect-square items-center justify-center rounded-lg border bg-muted" aria-label="Uploading">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ))}
            </div>
          )}

          {/* Link input */}
          {showLinkInput && !linkUrl && (
            <div className="mt-2 flex items-center gap-2">
              <Input
                autoFocus
                value={linkInput}
                onChange={(e) => setLinkInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addLink();
                  }
                }}
                placeholder="https://…"
                aria-label="Link URL"
                className="h-9 text-sm"
                inputMode="url"
              />
              <Button type="button" size="sm" className="h-9" onClick={addLink}>
                Attach
              </Button>
              <Button type="button" variant="ghost" size="sm" className="h-9" onClick={() => setShowLinkInput(false)}>
                Cancel
              </Button>
            </div>
          )}

          {/* AI suggestions */}
          {(aiBusy || aiSuggestions.length > 0 || aiNote) && (
            <div className="mt-2 rounded-xl border border-brand/25 bg-brand-soft/60 p-3">
              <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-brand">
                <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                {aiBusy ? "Thinking…" : aiNote ?? "AI suggestions"}
              </p>
              {aiBusy ? (
                <Loader2 className="h-4 w-4 animate-spin text-brand" />
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {aiSuggestions.map((s, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => applySuggestion(s)}
                      className="max-w-full truncate rounded-full border border-brand/30 bg-card px-3 py-1.5 text-left text-xs outline-none transition-colors hover:border-brand hover:text-brand focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {s.length > 80 ? `${s.slice(0, 80)}…` : s}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Toolbar */}
          <div
            className={cn(
              "mt-3 flex flex-wrap items-center gap-1 border-t pt-3",
              !compact && "sticky bottom-0 z-10 bg-card pb-1",
            )}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime"
              multiple
              hidden
              onChange={(e) => void handleFiles(e.target.files)}
              aria-hidden="true"
              tabIndex={-1}
            />
            <ToolbarButton
              label="Add photos or videos"
              onClick={() => fileInputRef.current?.click()}
              disabled={media.length >= 4}
            >
              <ImageIcon className="h-[18px] w-[18px]" aria-hidden="true" />
            </ToolbarButton>
            <ToolbarButton
              label="Add a poll"
              onClick={() => setPollOptions((opts) => (opts === null ? ["", ""] : null))}
              active={pollOptions !== null}
            >
              <BarChart3 className="h-[18px] w-[18px]" aria-hidden="true" />
            </ToolbarButton>

            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  aria-label="Add a feeling"
                  className={cn(
                    "flex h-9 w-9 items-center justify-center rounded-lg outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring",
                    feeling ? "text-brand" : "text-muted-foreground",
                  )}
                >
                  <Smile className="h-[18px] w-[18px]" aria-hidden="true" />
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-64 rounded-xl p-2" side="top">
                <p className="px-2 pb-1.5 text-xs font-semibold text-muted-foreground">How are you feeling?</p>
                <div className="grid grid-cols-4 gap-1">
                  {FEELINGS.map((f) => (
                    <button
                      key={f.label}
                      type="button"
                      onClick={() => {
                        setFeeling((cur) => (cur === f.label ? null : f.label));
                      }}
                      aria-label={`Feeling ${f.label}`}
                      aria-pressed={feeling === f.label}
                      title={f.label}
                      className={cn(
                        "flex h-11 items-center justify-center rounded-lg text-xl outline-none transition-transform hover:scale-110 focus-visible:ring-2 focus-visible:ring-ring",
                        feeling === f.label && "bg-brand-soft",
                      )}
                    >
                      <span aria-hidden="true">{f.emoji}</span>
                    </button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>

            {!linkUrl && (
              <ToolbarButton
                label="Attach a link"
                onClick={() => setShowLinkInput(true)}
                active={showLinkInput}
              >
                <Link2 className="h-[18px] w-[18px]" aria-hidden="true" />
              </ToolbarButton>
            )}

            <Select value={privacy} onValueChange={(v) => setPrivacy(v as Privacy)}>
              <SelectTrigger
                className="h-9 w-auto gap-1.5 rounded-lg border-none bg-transparent px-2.5 text-[13px] text-muted-foreground shadow-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring [&>svg:last-child]:h-4 [&>svg:last-child]:w-4"
                aria-label="Audience"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="PUBLIC">
                  <span className="flex items-center gap-2"><Globe className="h-4 w-4" /> Public</span>
                </SelectItem>
                <SelectItem value="FOLLOWERS">
                  <span className="flex items-center gap-2"><Users className="h-4 w-4" /> Followers</span>
                </SelectItem>
                <SelectItem value="ONLY_ME">
                  <span className="flex items-center gap-2"><Lock className="h-4 w-4" /> Only me</span>
                </SelectItem>
              </SelectContent>
            </Select>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label="AI writing helpers"
                  className="flex h-9 items-center gap-1 rounded-lg px-2.5 text-[13px] font-medium text-brand outline-none transition-colors hover:bg-brand-soft focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Sparkles className="h-4 w-4" aria-hidden="true" />
                  AI
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-48">
                <DropdownMenuItem onSelect={() => setAiDialogOpen(true)}>
                  <Sparkles className="h-4 w-4" /> Generate caption
                </DropdownMenuItem>
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <Sparkles className="h-4 w-4" /> Improve
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="w-40">
                    {AI_TONES.map((t) => (
                      <DropdownMenuItem key={t.id} onSelect={() => void aiImprove(t.id)}>
                        {t.label}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              </DropdownMenuContent>
            </DropdownMenu>

            <div className="ml-auto flex items-center gap-2">
              {content.length > MAX_POST_CHARS - 500 && (
                <span
                  className={cn(
                    "text-xs tabular-nums",
                    content.length > MAX_POST_CHARS - 200 ? "text-destructive" : "text-muted-foreground",
                  )}
                >
                  {content.length.toLocaleString()}
                </span>
              )}
              <Button
                onClick={() => void submit()}
                disabled={!canSubmit}
                aria-label="Publish post"
                className="h-10 rounded-full px-5 active:scale-[0.98]"
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Post"}
              </Button>
              {compact && (
                <Button variant="ghost" size="sm" className="h-9 rounded-full px-3 text-muted-foreground" onClick={reset}>
                  Cancel
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Generate-caption context dialog */}
      <Dialog open={aiDialogOpen} onOpenChange={setAiDialogOpen}>
        <DialogContent className="max-w-[calc(100%-2rem)] rounded-xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-4 w-4 text-brand" aria-hidden="true" /> Generate a caption
            </DialogTitle>
            <DialogDescription>
              Tell AI what your post is about and it will suggest a few openings.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={aiContext}
            onChange={(e) => setAiContext(e.target.value)}
            rows={3}
            maxLength={300}
            placeholder="e.g. Just shipped my first marathon — rain, hills and all."
            aria-label="Caption context"
            className="resize-none text-sm"
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAiDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                setAiDialogOpen(false);
                expand();
                void aiGenerateCaption();
              }}
              disabled={aiContext.trim().length === 0 || aiBusy}
            >
              {aiBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              Suggest
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ToolbarButton({
  label,
  onClick,
  children,
  disabled,
  active,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
  disabled?: boolean;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={cn(
        "flex h-9 w-9 items-center justify-center rounded-lg outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40",
        active ? "bg-brand-soft text-brand" : "text-muted-foreground hover:bg-accent hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function safeHost(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return url;
  }
}
