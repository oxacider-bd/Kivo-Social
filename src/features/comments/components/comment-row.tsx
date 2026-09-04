"use client";

import { useState } from "react";
import {
  ChevronDown,
  CornerDownRight,
  Heart,
  Loader2,
  MoreHorizontal,
  PenLine,
  Send,
  Sparkles,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { UserAvatar } from "@/components/user-avatar";
import { RichText } from "@/components/rich-text";
import { api } from "@/lib/api";
import { reactionMeta } from "@/lib/constants";
import { timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ReactionPicker } from "@/features/posts/components/reaction-picker";
import type { CommentDTO, CommentReactionSummary, ReactionType } from "@/types";

export interface CommentRowProps {
  comment: CommentDTO;
  postId: string;
  postContent: string;
  /** 0 = top-level, 1 = reply (no nested expansion by design). */
  depth?: 0 | 1;
  onChanged: (comment: CommentDTO) => void;
  onDeleted: (id: string) => void;
  /** Fires when a reply was posted under this comment (+1) or deleted (-1). */
  onReplyCountChange: (delta: 1 | -1) => void;
  /** Used by nested rows to hand the fresh reply up to the top-level row. */
  onReplyPosted?: (reply: CommentDTO) => void;
}

/**
 * A single comment inside the thread modal: content, reactions (quick heart +
 * full picker), inline reply composer, reply expansion, edit/delete and the
 * AI reply helper.
 */
export function CommentRow({
  comment,
  postId,
  postContent,
  depth = 0,
  onChanged,
  onDeleted,
  onReplyCountChange,
  onReplyPosted,
}: CommentRowProps) {
  const removed = comment.content === "";
  const isOwn = comment.viewer.canEdit;

  const [reactionSummary, setReactionSummary] = useState<CommentReactionSummary[]>(comment.reactionSummary);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(comment.content);
  const [busy, setBusy] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  // Replies (top-level only)
  const [repliesExpanded, setRepliesExpanded] = useState(false);
  const [replies, setReplies] = useState<CommentDTO[]>([]);
  const [repliesCursor, setRepliesCursor] = useState<string | null>(null);
  const [repliesLoading, setRepliesLoading] = useState(false);
  const [repliesLoadedOnce, setRepliesLoadedOnce] = useState(false);

  // Reply composer
  const [replyOpen, setReplyOpen] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [replying, setReplying] = useState(false);

  // AI reply suggestions
  const [aiBusy, setAiBusy] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<string[]>([]);

  const viewerReaction = reactionSummary.find((s) => s.viewerReacted)?.type ?? null;

  async function toggleReaction(type: ReactionType) {
    if (busy) return;
    setBusy(true);
    const prev = reactionSummary;
    // optimistic
    setReactionSummary((summary) => {
      const viewerHad = summary.find((s) => s.viewerReacted)?.type ?? null;
      const next = summary
        .map((s) => ({
          ...s,
          count: s.type === viewerHad ? s.count - 1 : s.count,
          viewerReacted: false,
        }))
        .filter((s) => s.count > 0);
      if (viewerHad !== type) {
        const existing = next.find((s) => s.type === type);
        if (existing) {
          existing.count += 1;
          existing.viewerReacted = true;
        } else {
          next.push({ type, count: 1, viewerReacted: true });
        }
      }
      return next.sort((a, b) => b.count - a.count);
    });
    try {
      const res = await api<{ summary: CommentReactionSummary[] }>(
        `/api/comments/${comment.id}/reactions`,
        { method: "POST", body: { type } },
      );
      setReactionSummary(res.summary);
    } catch (err) {
      setReactionSummary(prev);
      toast.error(err instanceof Error ? err.message : "Couldn't react. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function loadReplies(reset = false) {
    if (repliesLoading) return;
    setRepliesLoading(true);
    try {
      const cursor = reset ? null : repliesCursor;
      const page = await api<{ items: CommentDTO[]; nextCursor: string | null }>(
        `/api/comments/${comment.id}/replies?limit=10${cursor ? `&cursor=${cursor}` : ""}`,
      );
      setReplies((r) => (reset ? page.items : [...r, ...page.items]));
      setRepliesCursor(page.nextCursor);
      setRepliesLoadedOnce(true);
      setRepliesExpanded(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't load replies. Try again.");
    } finally {
      setRepliesLoading(false);
    }
  }

  async function submitReply() {
    const text = replyText.trim();
    if (!text || replying) return;
    setReplying(true);
    try {
      const created = await api<CommentDTO>(`/api/posts/${postId}/comments`, {
        method: "POST",
        body: { content: text, parentId: comment.id },
      });
      setReplyText("");
      setReplyOpen(false);
      setAiSuggestions([]);
      if (depth === 0) {
        setReplies((r) => [...r, created]);
        setRepliesExpanded(true);
        setRepliesLoadedOnce(true);
        onReplyCountChange(1);
      } else {
        onReplyPosted?.(created);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Your reply couldn't be posted. Try again.");
    } finally {
      setReplying(false);
    }
  }

  async function saveEdit() {
    const text = editText.trim();
    if (!text || busy) return;
    setBusy(true);
    try {
      const updated = await api<CommentDTO>(`/api/comments/${comment.id}`, {
        method: "PATCH",
        body: { content: text },
      });
      onChanged({ ...updated, replyCount: comment.replyCount });
      setEditing(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't update your comment. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function doDelete() {
    if (busy) return;
    setBusy(true);
    try {
      await api(`/api/comments/${comment.id}`, { method: "DELETE" });
      onDeleted(comment.id);
      if (depth === 1) onReplyCountChange(-1);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't delete your comment. Try again.");
    } finally {
      setBusy(false);
      setDeleteOpen(false);
    }
  }

  async function aiReply() {
    if (aiBusy) return;
    setAiBusy(true);
    try {
      const res = await api<{ suggestions?: string[]; text?: string }>("/api/ai/replies", {
        method: "POST",
        body: { comment: comment.content, postContent },
      });
      const suggestions = res.suggestions ?? (res.text ? [res.text] : []);
      if (suggestions.length === 0) throw new Error("empty");
      setAiSuggestions(suggestions);
      setReplyOpen(true);
    } catch {
      toast("AI is warming up, try again shortly");
    } finally {
      setAiBusy(false);
    }
  }

  // ── Soft-deleted comment ────────────────────────────────────────────────
  if (removed) {
    return (
      <div className={cn("flex gap-3", depth === 1 && "ml-1")}>
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted" aria-hidden="true">
          <Trash2 className="h-3.5 w-3.5 text-muted-foreground/60" />
        </div>
        <p className="flex flex-1 items-center text-sm italic text-muted-foreground/70">
          This comment was removed.
        </p>
      </div>
    );
  }

  return (
    <div className={cn("group/comment", depth === 1 && "ml-1")}>
      <div className="flex gap-3">
        <UserAvatar
          username={comment.author.username}
          fullName={comment.author.fullName}
          avatarUrl={comment.author.avatarUrl}
          size={depth === 1 ? 28 : 32}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-1.5">
            <div className="min-w-0 flex-1 rounded-2xl bg-muted/40 px-3.5 py-2.5">
              <div className="flex items-center gap-x-1.5 leading-tight">
                <span className="truncate text-sm font-semibold">{comment.author.fullName}</span>
                <span className="shrink-0 text-xs text-muted-foreground">@{comment.author.username}</span>
                <span aria-hidden="true" className="text-xs text-muted-foreground">·</span>
                <time dateTime={comment.createdAt} className="shrink-0 text-xs text-muted-foreground">
                  {timeAgo(comment.createdAt)}
                </time>
              </div>
              {editing ? (
                <div className="mt-2">
                  <Textarea
                    value={editText}
                    onChange={(e) => setEditText(e.target.value.slice(0, 2000))}
                    rows={2}
                    aria-label="Edit comment"
                    className="resize-none bg-card text-sm"
                  />
                  <div className="mt-1.5 flex gap-1.5">
                    <Button size="sm" className="h-7 rounded-full px-3 text-xs" onClick={() => void saveEdit()} disabled={busy || editText.trim().length === 0}>
                      {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : null} Save
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 rounded-full px-3 text-xs text-muted-foreground"
                      onClick={() => {
                        setEditing(false);
                        setEditText(comment.content);
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <RichText text={comment.content} className="mt-0.5 block text-[14.5px] leading-relaxed" />
              )}
            </div>

            {isOwn && !editing && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    aria-label="Comment options"
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground opacity-0 outline-none transition-opacity hover:bg-accent focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring group-hover/comment:opacity-100 max-md:opacity-100"
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-36">
                  <DropdownMenuItem
                    onSelect={() => {
                      setEditText(comment.content);
                      setEditing(true);
                    }}
                  >
                    <PenLine className="h-4 w-4" /> Edit
                  </DropdownMenuItem>
                  <DropdownMenuItem variant="destructive" onSelect={() => setDeleteOpen(true)}>
                    <Trash2 className="h-4 w-4" /> Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>

          {/* Action row: quick heart, picker, reply, AI */}
          {!editing && (
            <div className="mt-1 flex flex-wrap items-center gap-0.5 pl-1">
              <button
                type="button"
                onClick={() => void toggleReaction("LOVE")}
                aria-label={viewerReaction === "LOVE" ? "Remove love reaction" : "React with love"}
                aria-pressed={viewerReaction === "LOVE"}
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-full outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                  viewerReaction === "LOVE" ? "text-red-500 hover:bg-red-500/10" : "text-muted-foreground hover:bg-accent hover:text-red-500",
                )}
              >
                <Heart className={cn("h-4 w-4", viewerReaction === "LOVE" && "fill-red-500")} aria-hidden="true" />
              </button>

              <ReactionPicker mini align="start" onSelect={(type) => void toggleReaction(type)}>
                <button
                  type="button"
                  aria-label="More reactions"
                  className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <SmileDots />
                </button>
              </ReactionPicker>

              <button
                type="button"
                onClick={() => setReplyOpen((v) => !v)}
                aria-expanded={replyOpen}
                className="flex h-7 items-center gap-1 rounded-full px-2 text-xs font-medium text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
              >
                <CornerDownRight className="h-3.5 w-3.5" aria-hidden="true" />
                Reply
              </button>

              <button
                type="button"
                onClick={() => void aiReply()}
                disabled={aiBusy}
                aria-label="AI reply suggestions"
                className="flex h-7 w-7 items-center justify-center rounded-full text-brand/70 opacity-0 outline-none transition-opacity hover:bg-brand-soft focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring group-hover/comment:opacity-100 disabled:opacity-60 max-md:opacity-100"
              >
                {aiBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />}
              </button>

              {/* Reaction summary chips */}
              {reactionSummary.length > 0 && (
                <span className="ml-1 flex flex-wrap items-center gap-1">
                  {reactionSummary.map((s) => (
                    <button
                      key={s.type}
                      type="button"
                      onClick={() => void toggleReaction(s.type)}
                      aria-label={`${reactionMeta(s.type).label} — ${s.count} ${s.viewerReacted ? "(you reacted)" : ""}`}
                      className={cn(
                        "flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] outline-none transition-all focus-visible:ring-2 focus-visible:ring-ring",
                        s.viewerReacted
                          ? "bg-brand-soft font-semibold text-brand"
                          : "bg-muted text-muted-foreground hover:bg-accent",
                      )}
                    >
                      <span aria-hidden="true">{reactionMeta(s.type).emoji}</span>
                      {s.count}
                    </button>
                  ))}
                </span>
              )}

              {depth === 0 && comment.replyCount > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    if (!repliesLoadedOnce) void loadReplies(true);
                    else setRepliesExpanded((v) => !v);
                  }}
                  className="ml-1 flex h-7 items-center gap-1 rounded-full px-2 text-xs font-semibold text-brand outline-none transition-colors hover:bg-brand-soft focus-visible:ring-2 focus-visible:ring-ring"
                  aria-expanded={repliesExpanded}
                >
                  <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", repliesExpanded && "rotate-180")} aria-hidden="true" />
                  {comment.replyCount} {comment.replyCount === 1 ? "reply" : "replies"}
                </button>
              )}
            </div>
          )}

          {/* AI suggestion chips for replies */}
          {aiSuggestions.length > 0 && replyOpen && (
            <div className="mt-1.5 flex flex-wrap gap-1.5 pl-1">
              {aiSuggestions.map((s, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => {
                    setReplyText(s.slice(0, 2000));
                    setAiSuggestions([]);
                  }}
                  className="max-w-full truncate rounded-full border border-brand/30 bg-brand-soft/60 px-2.5 py-1 text-xs outline-none transition-colors hover:border-brand hover:text-brand focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Sparkles className="mr-1 inline h-3 w-3" aria-hidden="true" />
                  {s.length > 64 ? `${s.slice(0, 64)}…` : s}
                </button>
              ))}
            </div>
          )}

          {/* Inline reply composer */}
          {replyOpen && (
            <div className="mt-2 flex items-start gap-2 pl-1">
              <Textarea
                value={replyText}
                onChange={(e) => setReplyText(e.target.value.slice(0, 2000))}
                rows={1}
                placeholder={`Reply to ${comment.author.fullName}…`}
                aria-label="Reply text"
                className="min-h-[38px] resize-none rounded-full border bg-muted/40 px-4 py-2 text-sm"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void submitReply();
                  }
                }}
              />
              <Button
                size="icon"
                className="h-9 w-9 shrink-0 rounded-full bg-brand text-white hover:bg-brand-hover active:scale-95"
                onClick={() => void submitReply()}
                disabled={replying || replyText.trim().length === 0}
                aria-label="Send reply"
              >
                {replying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Replies thread */}
      {depth === 0 && repliesExpanded && replies.length > 0 && (
        <div className="relative ml-5 mt-3 space-y-3 border-l-2 border-border/70 pl-3 sm:ml-6 sm:pl-4">
          <span className="absolute -left-[5px] top-1.5 h-2 w-2 rounded-full border-2 border-border bg-card" aria-hidden="true" />
          {replies.map((r) => (
            <CommentRow
              key={r.id}
              comment={r}
              postId={postId}
              postContent={postContent}
              depth={1}
              onChanged={onChanged}
              onDeleted={(id) => setReplies((list) => list.filter((x) => x.id !== id))}
              onReplyCountChange={onReplyCountChange}
              onReplyPosted={(reply) => {
                setReplies((list) => [...list, reply]);
                onReplyCountChange(1);
              }}
            />
          ))}
          {repliesCursor && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 rounded-full text-xs text-muted-foreground"
              onClick={() => void loadReplies()}
              disabled={repliesLoading}
            >
              {repliesLoading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              More replies
            </Button>
          )}
        </div>
      )}

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent className="max-w-[calc(100%-2rem)] rounded-xl sm:max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this comment?</AlertDialogTitle>
            <AlertDialogDescription>
              {comment.replyCount > 0
                ? "It has replies — it will be shown as removed, but the conversation stays."
                : "This can't be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void doDelete();
              }}
              disabled={busy}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function SmileDots() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true">
      <circle cx="5" cy="12" r="2" />
      <circle cx="12" cy="12" r="2" />
      <circle cx="19" cy="12" r="2" />
    </svg>
  );
}
