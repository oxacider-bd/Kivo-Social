"use client";

import { memo, useCallback, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  AtSign,
  Bell,
  CheckCheck,
  MessageCircle,
  MoreHorizontal,
  UserCheck,
  UserPlus,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { navigateTo } from "@/lib/router";
import { fullTimestamp, timeAgo } from "@/lib/format";
import { REACTIONS } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/user-avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { markNotificationsRead } from "../lib/notifications-client";
import type { EnrichedNotification } from "../types";

// ─── Copy helpers ────────────────────────────────────────────────────────────

/** Best-effort emoji resolution: match the stored preview against KIVO's reaction set. */
function reactionEmojiFor(preview: string | null): string {
  if (preview) {
    const needle = preview.trim().toLowerCase();
    const direct = REACTIONS.find(
      (r) => r.emoji === preview.trim() || r.label.toLowerCase() === needle,
    );
    if (direct) return direct.emoji;
    const contained = REACTIONS.find(
      (r) => preview.includes(r.emoji) || needle.includes(r.label.toLowerCase()),
    );
    if (contained) return contained.emoji;
  }
  return REACTIONS[0]?.emoji ?? "❤️";
}

function typeBadge(n: EnrichedNotification): ReactNode {
  switch (n.type) {
    case "reaction":
      return <span aria-hidden>{reactionEmojiFor(n.preview)}</span>;
    case "comment":
    case "reply":
      return <MessageCircle className="h-2.5 w-2.5" aria-hidden />;
    case "mention":
      return <AtSign className="h-2.5 w-2.5" aria-hidden />;
    case "follow":
      return <UserPlus className="h-2.5 w-2.5" aria-hidden />;
    case "follow_accept":
      return <UserCheck className="h-2.5 w-2.5" aria-hidden />;
    case "follow_request":
      return <Bell className="h-2.5 w-2.5" aria-hidden />;
    case "space_post":
      return <Users className="h-2.5 w-2.5" aria-hidden />;
    default:
      return <Bell className="h-2.5 w-2.5" aria-hidden />;
  }
}

/** Two-tint system: engagement types get the brand tint, network types stay muted. */
function typeBadgeTinted(n: EnrichedNotification): string {
  switch (n.type) {
    case "reaction":
    case "comment":
    case "reply":
    case "mention":
    case "space_post":
      return "bg-brand-soft text-brand";
    default:
      return "bg-muted text-muted-foreground";
  }
}

/** Plain-text summary for aria labels (mirrors the visual copy). */
function ariaTextFor(n: EnrichedNotification): string {
  const name = n.actor?.fullName ?? "Someone";
  switch (n.type) {
    case "reaction":
      return `${name} reacted ${reactionEmojiFor(n.preview)} to your post`;
    case "comment":
      return `${name} commented: ${n.preview ?? ""}`;
    case "reply":
      return `${name} replied: ${n.preview ?? ""}`;
    case "mention":
      return `${name} mentioned you: ${n.preview ?? ""}`;
    case "follow":
      return `${name} started following you`;
    case "follow_accept":
      return `${name} accepted your follow request`;
    case "follow_request":
      return `${name} requested to follow you`;
    case "space_post":
      return `${name} posted in ${n.spaceName ?? "a Space"}: ${n.postPreview ?? ""}`;
    default:
      return `${name} sent you a notification`;
  }
}

/** Inline muted copy following the bold actor name (all phrasing content). */
function InlineCopy({ n }: { n: EnrichedNotification }) {
  switch (n.type) {
    case "reaction":
      return <span className="text-muted-foreground">reacted {reactionEmojiFor(n.preview)} to your post</span>;
    case "comment":
    case "reply":
    case "mention": {
      const verb =
        n.type === "comment" ? "commented" : n.type === "reply" ? "replied" : "mentioned you";
      return (
        <span className="text-muted-foreground">
          {verb}
          {n.preview ? `: \u201C${n.preview}\u201D` : ""}
        </span>
      );
    }
    case "follow":
      return <span className="text-muted-foreground">started following you</span>;
    case "follow_accept":
      return <span className="text-muted-foreground">accepted your follow request</span>;
    case "follow_request":
      return <span className="text-muted-foreground">requested to follow you</span>;
    case "space_post":
      return (
        <span className="text-muted-foreground">
          posted in{" "}
          <span className="font-medium text-foreground">{n.spaceName ?? "a Space"}</span>
        </span>
      );
    default:
      return null;
  }
}

// ─── Component ───────────────────────────────────────────────────────────────

function NotificationItemImpl({
  notification,
  onDismiss,
}: {
  notification: EnrichedNotification;
  /** Optimistically removes (or restores) the row from its list. */
  onDismiss?: (id: string, restore?: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<"accept" | "decline" | null>(null);
  const n = notification;
  const unread = n.readAt === null;
  const actorName = n.actor?.fullName ?? "Someone";
  const showsPostPreview = (n.type === "reaction" || n.type === "space_post") && !!n.postPreview;

  const handleOpen = useCallback(() => {
    if (n.readAt === null) {
      void markNotificationsRead(queryClient, [n.id]).catch(() => {
        // non-fatal — the row simply stays unread
      });
    }
    switch (n.type) {
      case "follow":
      case "follow_request":
      case "follow_accept":
        if (n.actor) navigateTo(`/profile/${n.actor.username}`);
        break;
      default:
        // Thread rows ask the home shell to open the ThreadModal for this post.
        if (n.postId) {
          window.dispatchEvent(
            new CustomEvent("kivo:open-thread", { detail: { postId: n.postId } }),
          );
          navigateTo("/");
        }
        break;
    }
  }, [n, queryClient]);

  const handleMarkRead = useCallback(async () => {
    try {
      await markNotificationsRead(queryClient, [n.id]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't mark as read. Try again.");
    }
  }, [n.id, queryClient]);

  const respond = useCallback(
    async (action: "accept" | "decline") => {
      if (!n.followRequestId) return;
      setBusy(action);
      onDismiss?.(n.id); // optimistic remove
      try {
        await api(`/api/follow-requests/${n.followRequestId}/${action}`, { method: "POST" });
        toast.success(
          action === "accept"
            ? `${actorName} is now following you`
            : `Request from ${actorName} declined`,
        );
        if (n.readAt === null) {
          try {
            await markNotificationsRead(queryClient, [n.id]);
          } catch {
            // non-fatal
          }
        }
      } catch (err) {
        onDismiss?.(n.id, true); // restore row
        toast.error(err instanceof Error ? err.message : "Something went wrong. Please try again.");
      } finally {
        setBusy(null);
      }
    },
    [n, actorName, onDismiss, queryClient],
  );

  const showRequestActions = n.type === "follow_request" && !!n.followRequestId;

  return (
    <div
      className={cn(
        "flex min-h-14 items-center gap-3 px-3 py-3 transition-colors duration-200 sm:px-4",
        unread ? "bg-brand-soft/50" : "hover:bg-accent/40",
      )}
    >
      <button
        type="button"
        onClick={handleOpen}
        className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={ariaTextFor(n)}
      >
        <span className="relative shrink-0">
          {n.actor ? (
            <UserAvatar
              username={n.actor.username}
              fullName={n.actor.fullName}
              avatarUrl={n.actor.avatarUrl}
              size={44}
              linkToProfile={false}
            />
          ) : (
            <span
              className="flex h-11 w-11 items-center justify-center rounded-full border border-border/60 bg-brand-soft text-brand"
              aria-hidden
            >
              <Bell className="h-5 w-5" />
            </span>
          )}
          <span
            className={cn(
              "absolute -bottom-0.5 -right-0.5 flex h-[18px] w-[18px] items-center justify-center rounded-full border border-border text-[10px] leading-none",
              typeBadgeTinted(n),
            )}
            aria-hidden
          >
            {typeBadge(n)}
          </span>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm leading-snug">
            <span className="font-semibold text-foreground">{actorName}</span>{" "}
            <InlineCopy n={n} />
          </span>
          {showsPostPreview && (
            <span className="block truncate text-xs text-muted-foreground/80">
              {n.postPreview}
            </span>
          )}
        </span>
      </button>

      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <div className="flex items-center gap-1.5">
          {unread && (
            <span className="h-2 w-2 rounded-full bg-brand" role="img" aria-label="Unread" />
          )}
          <time
            dateTime={n.createdAt}
            title={fullTimestamp(n.createdAt)}
            className="whitespace-nowrap text-xs tabular-nums text-muted-foreground"
          >
            {timeAgo(n.createdAt)}
          </time>
          {unread && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground"
                  aria-label={`Options for notification from ${actorName}`}
                >
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuItem onClick={() => void handleMarkRead()}>
                  <CheckCheck className="h-4 w-4" /> Mark as read
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
        {showRequestActions && (
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              className="h-8 px-3 text-xs"
              disabled={busy !== null}
              onClick={() => void respond("accept")}
            >
              Accept
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8 px-3 text-xs"
              disabled={busy !== null}
              onClick={() => void respond("decline")}
            >
              Decline
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

export const NotificationItem = memo(NotificationItemImpl);

// ─── Skeletons ───────────────────────────────────────────────────────────────

function NotificationItemSkeleton() {
  return (
    <div className="flex min-h-14 items-center gap-3 px-3 py-3 sm:px-4">
      <div className="skeleton h-11 w-11 shrink-0 rounded-full" />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="skeleton h-3.5 w-3/4 rounded-md" />
        <div className="skeleton h-3 w-2/5 rounded-md" />
      </div>
      <div className="skeleton h-3 w-8 shrink-0 rounded-md" />
    </div>
  );
}

export function NotificationListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div
      className="overflow-hidden rounded-2xl border bg-card card-shadow"
      aria-busy="true"
      aria-label="Loading notifications"
    >
      <div className="divide-y">
        {Array.from({ length: rows }, (_, i) => (
          <NotificationItemSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}
