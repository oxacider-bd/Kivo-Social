"use client";

import { useState } from "react";
import {
  Loader2,
  MessageSquare,
  Send,
  Sparkles,
  X,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { UserAvatar } from "@/components/user-avatar";
import { RichText } from "@/components/rich-text";
import { EmptyState } from "@/components/empty-state";
import { api } from "@/lib/api";
import { timeAgo } from "@/lib/format";
import { useSession } from "@/lib/session-store";
import { patchPostInCaches } from "@/features/posts/lib/post-cache";
import { CommentRow } from "@/features/comments/components/comment-row";
import { useInfiniteList } from "@/hooks/use-infinite";
import type { CommentDTO, PostDTO } from "@/types";

interface InfiniteComments {
  pages: { items: CommentDTO[]; nextCursor: string | null }[];
  pageParams: unknown[];
}

/**
 * KIVO THREADS — the signature conversation modal.
 * Post summary on top, then top-level comments (newest first) with inline
 * replies, reactions, edit/delete, AI summarize + AI reply suggestions and a
 * sticky composer. Comment mutations stay in sync with feed caches.
 */
export function ThreadModal({
  post,
  open,
  onClose,
}: {
  post: PostDTO | null;
  open: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const { user } = useSession();
  const postId = post?.id ?? "";

  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [summarizing, setSummarizing] = useState(false);

  const commentsQuery = useInfiniteList<CommentDTO>(
    ["post-comments", postId],
    (cursor, signal) =>
      api(`/api/posts/${postId}/comments?limit=10${cursor ? `&cursor=${cursor}` : ""}`, { signal }),
    { enabled: open && !!post },
  );

  const comments = commentsQuery.items;

  function updateComments(fn: (items: CommentDTO[]) => CommentDTO[]) {
    queryClient.setQueriesData<InfiniteComments>({ queryKey: ["post-comments", postId] }, (data) =>
      data ? { ...data, pages: data.pages.map((p) => ({ ...p, items: fn(p.items) })) } : data,
    );
  }

  function bumpFeedCommentCount(delta: 1 | -1) {
    patchPostInCaches(queryClient, postId, (p) => ({
      ...p,
      counts: { ...p.counts, comments: Math.max(0, p.counts.comments + delta) },
    }));
  }

  async function submitComment() {
    const body = text.trim();
    if (!body || submitting || !post) return;
    setSubmitting(true);
    const tempId = `temp-${Date.now()}`;
    const optimistic: CommentDTO = {
      id: tempId,
      postId: post.id,
      parentId: null,
      content: body,
      author: {
        id: user?.profile.id ?? "",
        userId: user?.id ?? "",
        username: user?.profile.username ?? "you",
        fullName: user?.profile.fullName ?? "You",
        avatarUrl: user?.profile.avatarUrl ?? null,
        bio: user?.profile.bio ?? "",
        isPrivate: user?.profile.isPrivate ?? false,
        mood: user?.profile.mood ?? "",
        viewer: { isSelf: true, isFollowing: false, isRequested: false, followsViewer: false },
      },
      replyCount: 0,
      reactionSummary: [],
      viewer: { canEdit: true },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    updateComments((items) => [optimistic, ...items]);
    bumpFeedCommentCount(1);
    setText("");
    try {
      const created = await api<CommentDTO>(`/api/posts/${post.id}/comments`, {
        method: "POST",
        body: { content: body },
      });
      updateComments((items) => items.map((c) => (c.id === tempId ? created : c)));
    } catch (err) {
      updateComments((items) => items.filter((c) => c.id !== tempId));
      bumpFeedCommentCount(-1);
      setText(body);
      toast.error(err instanceof Error ? err.message : "Your comment couldn't be posted. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function summarize() {
    if (summarizing || !post) return;
    const contents = comments
      .filter((c) => c.content !== "")
      .map((c) => c.content);
    if (contents.length === 0) {
      toast("There are no comments to summarize yet.");
      return;
    }
    setSummarizing(true);
    try {
      const res = await api<{ summary?: string; text?: string }>("/api/ai/summarize", {
        method: "POST",
        body: { comments: contents },
      });
      const text = res.summary ?? res.text;
      if (!text) throw new Error("empty");
      setAiSummary(text);
    } catch {
      toast.error("AI is warming up, try again shortly");
    } finally {
      setSummarizing(false);
    }
  }

  function handleCommentDeleted(comment: CommentDTO) {
    if (comment.replyCount > 0) {
      // Soft-deleted server-side: keep the row as a thread anchor.
      updateComments((items) =>
        items.map((c) => (c.id === comment.id ? { ...c, content: "" } : c)),
      );
    } else {
      updateComments((items) => items.filter((c) => c.id !== comment.id));
      bumpFeedCommentCount(-1);
    }
  }

  if (!post) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        showCloseButton={false}
        aria-describedby={undefined}
        className="flex h-[100dvh] w-full max-w-none flex-col gap-0 overflow-hidden rounded-none p-0 sm:h-[80vh] sm:max-w-2xl sm:rounded-2xl"
      >
        {/* ── Sticky header ──────────────────────────────────────────── */}
        <header className="flex shrink-0 items-center gap-2 border-b glass px-3 py-2.5 sm:px-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label="Close thread"
            className="h-9 w-9 rounded-full text-muted-foreground hover:bg-accent"
          >
            <X className="h-5 w-5" />
          </Button>
          <div className="min-w-0 flex-1 leading-tight">
            <DialogTitle className="text-[15px] font-semibold">Thread</DialogTitle>
            <p className="truncate text-xs text-muted-foreground">
              with {post.author.fullName} · {timeAgo(post.createdAt)}
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void summarize()}
            disabled={summarizing}
            aria-label="Summarize this conversation with AI"
            className="h-9 gap-1.5 rounded-full px-3 text-[13px] font-medium text-brand hover:bg-brand-soft"
          >
            {summarizing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" aria-hidden="true" />}
            <span className="hidden sm:inline">Summarize</span>
          </Button>
        </header>

        {/* ── Scrollable body ────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto scrollbar-slim">
          {/* Post summary (non-interactive) */}
          <section className="border-b px-4 py-3 sm:px-5" aria-label="Original post">
            <div className="flex items-center gap-2.5">
              <UserAvatar
                username={post.author.username}
                fullName={post.author.fullName}
                avatarUrl={post.author.avatarUrl}
                size={36}
                linkToProfile={false}
              />
              <div className="min-w-0 flex-1 leading-tight">
                <p className="truncate text-sm font-semibold">{post.author.fullName}</p>
                <p className="text-xs text-muted-foreground">
                  @{post.author.username} · {timeAgo(post.createdAt)}
                </p>
              </div>
            </div>
            {post.content && (
              <RichText text={post.content} className="mt-2 block text-[14.5px] leading-relaxed" />
            )}
            {post.media.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {post.media.slice(0, 4).map((m) =>
                  m.type === "image" ? (
                     
                    <img
                      key={m.id}
                      src={m.url}
                      alt="Post attachment"
                      loading="lazy"
                      className="h-16 w-16 rounded-xl border object-cover"
                    />
                  ) : (
                    <video
                      key={m.id}
                      src={m.url}
                      preload="metadata"
                      muted
                      aria-label="Post video attachment"
                      className="h-16 w-16 rounded-xl border object-cover"
                    />
                  ),
                )}
              </div>
            )}
          </section>

          {/* AI summary */}
          {aiSummary && (
            <div className="mx-4 mt-3 flex items-start gap-2 rounded-xl border border-brand/25 bg-brand-soft/60 p-3 sm:mx-5">
              <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-brand" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-brand">AI summary</p>
                <p className="mt-0.5 text-[13px] leading-relaxed">{aiSummary}</p>
              </div>
              <button
                type="button"
                onClick={() => setAiSummary(null)}
                aria-label="Dismiss summary"
                className="rounded-full p-1 text-brand/70 outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {/* Comments */}
          <section className="px-4 py-4 sm:px-5" aria-label="Comments">
            {commentsQuery.isLoading ? (
              <div className="space-y-5" aria-label="Loading comments">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="flex gap-3">
                    <Skeleton className="skeleton h-8 w-8 rounded-full" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="skeleton h-3 w-28" />
                      <Skeleton className="skeleton h-3.5 w-full" />
                      <Skeleton className="skeleton h-3.5 w-2/3" />
                    </div>
                  </div>
                ))}
              </div>
            ) : commentsQuery.isError ? (
              <div className="py-6 text-center">
                <p className="text-sm font-semibold">Comments couldn&apos;t load</p>
                <p className="mt-1 text-sm text-muted-foreground">Check your connection and try again.</p>
                <Button variant="outline" size="sm" className="mt-3 rounded-full" onClick={() => void commentsQuery.refetch()}>
                  Retry
                </Button>
              </div>
            ) : comments.length === 0 ? (
              <EmptyState
                className="border-none py-10"
                icon={<MessageSquare className="h-8 w-8" />}
                title="No comments yet"
                description="Be the first to say something thoughtful."
              />
            ) : (
              <div className="space-y-5">
                {comments.map((c) => (
                  <CommentRow
                    key={c.id}
                    comment={c}
                    postId={post.id}
                    postContent={post.content}
                    onChanged={(updated) =>
                      updateComments((items) => items.map((x) => (x.id === updated.id ? { ...updated, replyCount: x.replyCount } : x)))
                    }
                    onDeleted={() => handleCommentDeleted(c)}
                    onReplyCountChange={(delta) =>
                      updateComments((items) =>
                        items.map((x) =>
                          x.id === c.id ? { ...x, replyCount: Math.max(0, x.replyCount + delta) } : x,
                        ),
                      )
                    }
                  />
                ))}
                {commentsQuery.hasNextPage && (
                  <div className="flex justify-center pt-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="rounded-full text-muted-foreground"
                      onClick={() => void commentsQuery.fetchNextPage()}
                      disabled={commentsQuery.isFetchingNextPage}
                    >
                      {commentsQuery.isFetchingNextPage && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                      View older comments
                    </Button>
                  </div>
                )}
              </div>
            )}
          </section>
        </div>

        {/* ── Sticky composer ────────────────────────────────────────── */}
        <footer className="shrink-0 border-t glass px-3 py-2.5 sm:px-4">
          <div className="flex items-end gap-2">
            <UserAvatar
              username={user?.profile.username ?? "you"}
              fullName={user?.profile.fullName ?? "You"}
              avatarUrl={user?.profile.avatarUrl}
              size={34}
              linkToProfile={false}
            />
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value.slice(0, 2000))}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void submitComment();
                }
              }}
              placeholder="Add a comment…"
              aria-label="Add a comment"
              rows={1}
              className="max-h-32 min-h-[40px] flex-1 resize-none rounded-full border bg-muted/40 px-4 py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-brand/50 focus-visible:ring-2 focus-visible:ring-ring"
            />
            <Button
              size="icon"
              onClick={() => void submitComment()}
              disabled={submitting || text.trim().length === 0}
              aria-label="Post comment"
              className="h-10 w-10 shrink-0 rounded-full bg-brand text-white hover:bg-brand-hover active:scale-95"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
        </footer>
      </DialogContent>
    </Dialog>
  );
}
