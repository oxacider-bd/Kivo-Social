"use client";

import { memo, useEffect, useState } from "react";
import Link from "next/link";
import {
  Globe,
  Link2,
  Loader2,
  Lock,
  MessageCircle,
  MoreHorizontal,
  PenLine,
  Send,
  Share2,
  Smile,
  Trash2,
  Users,
} from "lucide-react";
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { UserAvatar } from "@/components/user-avatar";
import { RichText } from "@/components/rich-text";
import { api } from "@/lib/api";
import { FEELINGS, REACTIONS, reactionMeta } from "@/lib/constants";
import { formatCount, timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";
import { MediaGrid } from "@/features/posts/components/media-grid";
import { PollCard } from "@/features/posts/components/poll-card";
import { LinkPreviewCard } from "@/features/posts/components/link-preview-card";
import { ReactionPicker } from "@/features/posts/components/reaction-picker";
import { ReactionDetails } from "@/features/posts/components/reaction-details";
import { SaveButton } from "@/features/posts/components/save-button";
import { applyReactionToggle } from "@/features/posts/lib/post-cache";
import type { PostDTO, Privacy, ReactionToggleDTO, ReactionType } from "@/types";

export interface PostCardProps {
  post: PostDTO;
  onOpenThread?: (post: PostDTO) => void;
  onPostChanged?: (post: PostDTO) => void;
  onPostDeleted?: (id: string) => void;
}

const PRIVACY_META: Record<Privacy, { icon: typeof Globe; label: string }> = {
  PUBLIC: { icon: Globe, label: "Public" },
  FOLLOWERS: { icon: Users, label: "Followers only" },
  ONLY_ME: { icon: Lock, label: "Only me" },
};

function feelingEmoji(feeling: string): string | null {
  const match = FEELINGS.find(
    (f) => feeling.toLowerCase().includes(f.label) || f.label.includes(feeling.toLowerCase()),
  );
  return match?.emoji ?? null;
}

/**
 * The KIVO post card — header, rich content, media/poll/link, and a footer
 * of three pill actions (react / comment / share) plus save. All mutations
 * are optimistic with rollback + parent sync via onPostChanged.
 */
export const PostCard = memo(function PostCard({
  post,
  onOpenThread,
  onPostChanged,
  onPostDeleted,
}: PostCardProps) {
  const [data, setData] = useState(post);
  const [expanded, setExpanded] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editText, setEditText] = useState("");
  const [editPrivacy, setEditPrivacy] = useState<Privacy>("PUBLIC");
  const [savingEdit, setSavingEdit] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Re-sync when the parent cache hands us a fresher version of this post.
  useEffect(() => {
    setData(post);
  }, [post]);

  function commit(next: PostDTO) {
    setData(next);
    onPostChanged?.(next);
  }

  async function react(type: ReactionType) {
    const snapshot = data;
    const prev = data.viewerReaction;
    const updated = optimisticReaction(data, type, prev);
    setData(updated);
    try {
      const res = await api<ReactionToggleDTO>(`/api/posts/${data.id}/reactions`, {
        method: "POST",
        body: { type },
      });
      commit(applyReactionToggle(data, res));
    } catch (err) {
      setData(snapshot);
      onPostChanged?.(snapshot);
      toast.error(err instanceof Error ? err.message : "Couldn't save that reaction. Try again.");
    }
  }

  function openEdit() {
    setEditText(data.content);
    setEditPrivacy(data.privacy);
    setEditOpen(true);
  }

  async function saveEdit() {
    if (savingEdit) return;
    setSavingEdit(true);
    try {
      const updated = await api<PostDTO>(`/api/posts/${data.id}`, {
        method: "PATCH",
        body: { content: editText.trim(), privacy: editPrivacy },
      });
      commit(updated);
      setEditOpen(false);
      toast.success("Post updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't update your post. Try again.");
    } finally {
      setSavingEdit(false);
    }
  }

  async function remove() {
    if (deleting) return;
    setDeleting(true);
    try {
      await api(`/api/posts/${data.id}`, { method: "DELETE" });
      onPostDeleted?.(data.id);
      toast("Post deleted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't delete your post. Try again.");
    } finally {
      setDeleting(false);
      setDeleteOpen(false);
    }
  }

  function postUrl(): string {
    return `${window.location.origin}${window.location.pathname}#/post/${data.id}`;
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(postUrl());
      toast("Link copied to clipboard");
    } catch {
      toast.error("Couldn't copy the link. Try again.");
    }
  }

  async function nativeShare() {
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title: `${data.author.fullName} on KIVO`, text: data.content.slice(0, 200), url: postUrl() });
        return;
      } catch {
        return; // user dismissed the share sheet
      }
    }
    await copyLink();
  }

  const author = data.author;
  const PrivacyIcon = PRIVACY_META[data.privacy].icon;
  const isEdited = new Date(data.updatedAt).getTime() - new Date(data.createdAt).getTime() > 60_000;
  const isLong = data.content.length > 500;
  const shownContent = expanded || !isLong ? data.content : data.content.slice(0, 500);
  const viewerReactionMeta = data.viewerReaction ? reactionMeta(data.viewerReaction) : null;
  const emoji = data.feeling ? feelingEmoji(data.feeling) : null;

  return (
    <article className="rounded-2xl border bg-card p-4 card-shadow transition-shadow sm:p-5" aria-label={`Post by ${author.fullName}`}>
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className="flex items-start gap-3">
        <UserAvatar
          username={author.username}
          fullName={author.fullName}
          avatarUrl={author.avatarUrl}
          size={40}
        />
        <div className="min-w-0 flex-1 leading-tight">
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
            <Link
              href={`#/profile/${author.username}`}
              className="truncate text-[15px] font-semibold rounded-sm outline-none hover:underline hover:decoration-1 hover:underline-offset-2 focus-visible:ring-2 focus-visible:ring-ring"
              onClick={(e) => e.stopPropagation()}
            >
              {author.fullName}
            </Link>
            {data.feeling && (
              <span className="flex items-center gap-1 rounded-full bg-brand-soft px-2 py-0.5 text-xs text-brand">
                {emoji && <span aria-hidden="true">{emoji}</span>}
                feeling {data.feeling}
              </span>
            )}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[13px] text-muted-foreground">
            <span>@{author.username}</span>
            <span aria-hidden="true">·</span>
            <time dateTime={data.createdAt} title={new Date(data.createdAt).toLocaleString()}>
              {timeAgo(data.createdAt)}
            </time>
            {isEdited && <span className="text-muted-foreground/80">· edited</span>}
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex items-center" aria-label={`Audience: ${PRIVACY_META[data.privacy].label}`}>
                  <PrivacyIcon className="h-3.5 w-3.5" aria-hidden="true" />
                </span>
              </TooltipTrigger>
              <TooltipContent className="text-[11px]">{PRIVACY_META[data.privacy].label}</TooltipContent>
            </Tooltip>
          </div>
          {data.space && (
            <Link
              href={`#/spaces/${data.space.slug}`}
              onClick={(e) => e.stopPropagation()}
              className="mt-1 inline-flex items-center gap-1 rounded-full border border-brand/30 bg-brand-soft px-2 py-0.5 text-[11px] font-medium text-brand hover:border-brand/60"
            >
              <Users className="h-3 w-3" aria-hidden="true" />
              {data.space.name}
            </Link>
          )}
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Post options"
              className="h-9 w-9 shrink-0 rounded-full text-muted-foreground hover:bg-accent"
            >
              <MoreHorizontal className="h-5 w-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            {author.viewer.isSelf && (
              <>
                <DropdownMenuItem onSelect={openEdit}>
                  <PenLine className="h-4 w-4" /> Edit post
                </DropdownMenuItem>
                <DropdownMenuItem
                  variant="destructive"
                  onSelect={() => setDeleteOpen(true)}
                >
                  <Trash2 className="h-4 w-4" /> Delete post
                </DropdownMenuItem>
                <DropdownMenuSeparator />
              </>
            )}
            <DropdownMenuItem onSelect={() => void copyLink()}>
              <Link2 className="h-4 w-4" /> Copy link
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      {/* ── Content ────────────────────────────────────────────────────── */}
      {data.content && (
        <div className="mt-3 text-[15px] leading-relaxed">
          <RichText text={shownContent} className={cn(!expanded && isLong && "line-clamp-none")} />
          {/* clamp handled via slice for rich-text safety */}
          {isLong && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="mt-1 block text-sm font-medium text-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
              aria-expanded={expanded}
            >
              {expanded ? "Show less" : "Show more"}
            </button>
          )}
        </div>
      )}

      <MediaGrid media={data.media} />
      {data.poll && <PollCard poll={data.poll} onVoted={(poll) => commit({ ...data, poll })} />}
      {data.link && <LinkPreviewCard link={data.link} />}

      {/* ── Reaction summary ───────────────────────────────────────────── */}
      {data.counts.reactions > 0 && (
        <div className="mt-3 flex items-center border-t border-border/60 pt-2.5">
          <ReactionDetails post={data}>
            <button
              type="button"
              className="flex items-center gap-1 rounded-full bg-muted/60 px-2 py-0.5 text-[13px] text-muted-foreground outline-none transition-all hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={`${formatCount(data.counts.reactions)} reactions — see who reacted`}
            >
              <span className="flex -space-x-1" aria-hidden="true">
                {data.topReactions.slice(0, 3).map((r) => (
                  <span
                    key={r.type}
                    className="flex h-[18px] w-[18px] items-center justify-center rounded-full bg-card text-[11px] ring-1 ring-card"
                  >
                    {reactionMeta(r.type).emoji}
                  </span>
                ))}
              </span>
              {formatCount(data.counts.reactions)}
            </button>
          </ReactionDetails>
        </div>
      )}

      {/* ── Footer actions ─────────────────────────────────────────────── */}
      <footer className="mt-1 flex items-center gap-0.5 min-[420px]:gap-1.5">
        <ReactionPicker onSelect={(type) => void react(type)}>
          <button
            type="button"
            className={cn(
              "flex h-9 min-w-[64px] items-center justify-center gap-1.5 rounded-full px-2 min-[420px]:px-3 text-[13px] font-medium outline-none transition-colors active:scale-95 focus-visible:ring-2 focus-visible:ring-ring",
              viewerReactionMeta
                ? cn(viewerReactionMeta.color, "hover:bg-brand-soft")
                : "text-muted-foreground hover:bg-brand-soft hover:text-brand",
            )}
            aria-label={viewerReactionMeta ? `Reacted ${viewerReactionMeta.label} — change reaction` : "React to this post"}
          >
            {viewerReactionMeta ? (
              <>
                <span className="text-base leading-none" aria-hidden="true">{viewerReactionMeta.emoji}</span>
                {viewerReactionMeta.label}
              </>
            ) : (
              <>
                <Smile className="h-[18px] w-[18px]" aria-hidden="true" />
                React
              </>
            )}
          </button>
        </ReactionPicker>

        <button
          type="button"
          onClick={() => onOpenThread?.(data)}
          className="flex h-9 items-center gap-1.5 rounded-full px-2 min-[420px]:px-3 text-[13px] font-medium text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground active:scale-95 focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={`Open thread — ${formatCount(data.counts.comments)} comments`}
        >
          <MessageCircle className="h-[18px] w-[18px]" aria-hidden="true" />
          Comment
        </button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex h-9 items-center gap-1.5 rounded-full px-2 min-[420px]:px-3 text-[13px] font-medium text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground active:scale-95 focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Share this post"
            >
              <Send className="h-[17px] w-[17px]" aria-hidden="true" />
              Share
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-44">
            <DropdownMenuItem onSelect={() => void copyLink()}>
              <Link2 className="h-4 w-4" /> Copy link
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => void nativeShare()}>
              <Share2 className="h-4 w-4" /> Share…
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={() => onOpenThread?.(data)}
            className="hidden h-7 items-center rounded-full px-2.5 text-[13px] text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring sm:flex"
            aria-label={`${formatCount(data.counts.comments)} comments`}
          >
            {formatCount(data.counts.comments)} {data.counts.comments === 1 ? "comment" : "comments"}
          </button>
          <SaveButton post={data} onChange={(saved) => commit({ ...data, viewerSaved: saved })} />
        </div>
      </footer>

      {/* ── Edit dialog ────────────────────────────────────────────────── */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-[calc(100%-2rem)] rounded-xl sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit post</DialogTitle>
            <DialogDescription>Fine-tune your words and audience.</DialogDescription>
          </DialogHeader>
          <Textarea
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            rows={5}
            maxLength={5000}
            aria-label="Post text"
            className="resize-none text-[15px]"
          />
          <div className="flex items-center gap-2">
            <Select value={editPrivacy} onValueChange={(v) => setEditPrivacy(v as Privacy)}>
              <SelectTrigger className="h-9 w-40" aria-label="Audience">
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
            <span className="ml-auto text-xs text-muted-foreground">{editText.length}/5,000</span>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button
              onClick={() => void saveEdit()}
              disabled={savingEdit || editText.trim().length === 0}
            >
              {savingEdit && <Loader2 className="h-4 w-4 animate-spin" />}
              Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete confirm ─────────────────────────────────────────────── */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent className="max-w-[calc(100%-2rem)] rounded-xl sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this post?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the post, its comments and reactions for everyone. This can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void remove();
              }}
              disabled={deleting}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {deleting && <Loader2 className="h-4 w-4 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </article>
  );
});

/** Optimistically recompute reaction counts/top-3 without a round-trip. */
function optimisticReaction(
  post: PostDTO,
  type: ReactionType,
  prev: ReactionType | null,
): PostDTO {
  const map = new Map<ReactionType, number>();
  for (const r of post.topReactions) map.set(r.type, r.count);
  if (prev) map.set(prev, Math.max(0, (map.get(prev) ?? 1) - 1));
  const next: ReactionType | null = prev === type ? null : type;
  if (next) map.set(next, (map.get(next) ?? 0) + 1);
  const total = post.counts.reactions - (prev ? 1 : 0) + (next ? 1 : 0);
  const topReactions = [...map.entries()]
    .filter(([, count]) => count > 0)
    .map(([t, count]) => ({ type: t, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);
  return {
    ...post,
    counts: { ...post.counts, reactions: Math.max(0, total) },
    topReactions,
    viewerReaction: next,
  };
}

export function PostCardSkeleton() {
  return (
    <div className="rounded-2xl border bg-card p-4 card-shadow sm:p-5" aria-hidden="true">
      <div className="flex items-center gap-3">
        <Skeleton className="skeleton h-10 w-10 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="skeleton h-3.5 w-32" />
          <Skeleton className="skeleton h-3 w-24" />
        </div>
      </div>
      <div className="mt-4 space-y-2">
        <Skeleton className="skeleton h-3.5 w-full" />
        <Skeleton className="skeleton h-3.5 w-4/5" />
      </div>
      <Skeleton className="skeleton mt-4 h-40 w-full rounded-xl" />
      <div className="mt-4 flex gap-2">
        <Skeleton className="skeleton h-9 w-24 rounded-full" />
        <Skeleton className="skeleton h-9 w-24 rounded-full" />
        <Skeleton className="skeleton h-9 w-24 rounded-full" />
      </div>
    </div>
  );
}

export default PostCard;
