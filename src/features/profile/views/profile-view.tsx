"use client";
/* eslint-disable react-hooks/refs -- useInfiniteList returns sentinelRef mixed with plain react-query state; reads below are query state, and sentinelRef is only ever attached to a DOM node (its documented contract). */

import { memo, useCallback, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarDays,
  Copy,
  Ellipsis,
  Film,
  Heart,
  Images,
  Lock,
  MessageCircle,
  Pencil,
  Share2,
  Sparkles,
  StickyNote,
} from "lucide-react";
import { toast } from "sonner";

import { api, ApiError } from "@/lib/api";
import { formatCount, joinedDate } from "@/lib/format";
import { useComposer } from "@/lib/ui-store";
import { cn } from "@/lib/utils";
import { useInfiniteList } from "@/hooks/use-infinite";
import type { Page, PostDTO, ProfileDetailDTO } from "@/types";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UserAvatar } from "@/components/user-avatar";
import { FollowButton } from "@/components/follow-button";
import { EmptyState, ErrorState } from "@/components/empty-state";
import { PostCard, PostCardSkeleton } from "@/features/posts/components/post-card";
import { ThreadModal } from "@/features/comments/components/thread-modal";
import { EditProfileDialog } from "../components/edit-profile-dialog";
import { FollowListDialog } from "../components/follow-list-dialog";

const MemoPostCard = memo(PostCard);

type ProfileTab = "posts" | "photos" | "videos" | "about";
type MediaTile = { mediaId: string; url: string; post: PostDTO };

// ─── Loading skeleton (mirrors the real layout) ─────────────────────────────

function ProfileSkeleton() {
  return (
    <div aria-hidden="true" role="status" aria-label="Loading profile">
      {/* Cover card */}
      <div className="skeleton h-28 rounded-2xl sm:h-40 md:h-48" />

      {/* Avatar + actions row */}
      <div className="-mt-10 flex flex-wrap items-end gap-3 md:-mt-12">
        <div className="skeleton h-20 w-20 shrink-0 rounded-full ring-4 ring-background md:h-24 md:w-24" />
        <div className="ml-auto flex items-center gap-2">
          <div className="skeleton h-10 w-10 rounded-full" />
        </div>
        <div className="w-full sm:w-28">
          <div className="skeleton h-10 w-full rounded-full" />
        </div>
      </div>

      {/* Identity */}
      <div className="mt-5 space-y-2.5">
        <div className="skeleton h-6 w-48 rounded-md" />
        <div className="skeleton h-4 w-28 rounded-md" />
        <div className="skeleton h-7 w-44 rounded-full" />
        <div className="skeleton h-4 w-full max-w-md rounded-md" />
        <div className="skeleton h-3.5 w-36 rounded-md" />
      </div>

      {/* Tab row */}
      <div className="mt-6 flex gap-6 border-b pb-3">
        <div className="skeleton h-4 w-14 rounded-md" />
        <div className="skeleton h-4 w-16 rounded-md" />
        <div className="skeleton h-4 w-14 rounded-md" />
        <div className="skeleton h-4 w-12 rounded-md" />
      </div>

      {/* First post cards */}
      <div className="mt-4 space-y-3">
        {[0, 1].map((i) => (
          <div key={i} className="rounded-2xl border bg-card p-4 sm:p-5">
            <div className="flex items-center gap-3">
              <div className="skeleton h-10 w-10 rounded-full" />
              <div className="flex-1 space-y-1.5">
                <div className="skeleton h-3.5 w-32 rounded-md" />
                <div className="skeleton h-3 w-20 rounded-md" />
              </div>
            </div>
            <div className="mt-3 space-y-2">
              <div className="skeleton h-3.5 w-full rounded-md" />
              <div className="skeleton h-3.5 w-4/5 rounded-md" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Cover ───────────────────────────────────────────────────────────────────

/**
 * Cover card: rounded within the column (~3:1 on mobile, tall on desktop),
 * subtle bottom scrim and a fade-in once the image has loaded.
 */
const ProfileCover = memo(function ProfileCover({
  src,
  name,
}: {
  src: string | null;
  name: string;
}) {
  const [loaded, setLoaded] = useState(false);
  return (
    <div className="relative h-28 w-full overflow-hidden rounded-2xl border bg-muted sm:h-40 md:h-48">
      {src ? (
        <img
          src={src}
          alt={`${name}'s cover`}
          loading="lazy"
          onLoad={() => setLoaded(true)}
          className={cn(
            "h-full w-full object-cover transition-opacity duration-300",
            loaded ? "opacity-100" : "opacity-0",
          )}
        />
      ) : (
        <div className="brand-gradient absolute inset-0" aria-hidden="true">
          <div
            className="absolute inset-0 opacity-25"
            style={{
              backgroundImage:
                "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.6) 1px, transparent 0)",
              backgroundSize: "18px 18px",
            }}
          />
        </div>
      )}
      {/* Bottom scrim keeps the overlap area readable over bright covers */}
      <div
        className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/35 to-transparent"
        aria-hidden="true"
      />
    </div>
  );
});

// ─── Posts tab ───────────────────────────────────────────────────────────────

function ProfilePostsTab({
  username,
  isSelf,
  onOpenThread,
  onPostDeleted,
}: {
  username: string;
  isSelf: boolean;
  onOpenThread: (post: PostDTO) => void;
  onPostDeleted: () => void;
}) {
  const openComposer = useComposer((s) => s.openComposer);
  const list = useInfiniteList<PostDTO>(
    ["profile-posts", username, "posts"],
    useCallback(
      (cursor: string | null, signal: AbortSignal) =>
        api<Page<PostDTO>>(
          `/api/profiles/${encodeURIComponent(username)}/posts?tab=posts${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
          { signal },
        ),
      [username],
    ),
  );

  if (list.isLoading) {
    return (
      <div className="space-y-3" role="status" aria-label="Loading posts">
        <PostCardSkeleton />
        <PostCardSkeleton />
        <PostCardSkeleton />
      </div>
    );
  }

  if (list.isError) {
    return (
      <ErrorState
        title="Couldn't load posts"
        description="Please try again in a moment."
        action={
          <Button variant="outline" size="sm" onClick={() => void list.refetch()}>
            Try again
          </Button>
        }
      />
    );
  }

  if (list.items.length === 0) {
    return (
      <EmptyState
        icon={<StickyNote className="h-10 w-10" />}
        title="No posts yet."
        description={
          isSelf
            ? "Your thoughts deserve an audience. Share your first one!"
            : `When @${username} posts, it will show up here.`
        }
        action={
          isSelf ? (
            <Button onClick={() => openComposer()}>
              <MessageCircle className="h-4 w-4" aria-hidden="true" /> Write your first post
            </Button>
          ) : undefined
        }
      />
    );
  }

  return (
    <div className="space-y-3">
      {list.items.map((post) => (
        <MemoPostCard
          key={post.id}
          post={post}
          onOpenThread={onOpenThread}
          onPostDeleted={onPostDeleted}
        />
      ))}
      {list.isFetchingNextPage && <PostCardSkeleton />}
      <div ref={list.sentinelRef} aria-hidden="true" />
    </div>
  );
}

// ─── Photos tab ──────────────────────────────────────────────────────────────

function ProfilePhotosTab({
  username,
  isSelf,
  onOpenPhoto,
}: {
  username: string;
  isSelf: boolean;
  onOpenPhoto: (tile: MediaTile) => void;
}) {
  const list = useInfiniteList<PostDTO>(
    ["profile-posts", username, "photos"],
    useCallback(
      (cursor: string | null, signal: AbortSignal) =>
        api<Page<PostDTO>>(
          `/api/profiles/${encodeURIComponent(username)}/posts?tab=photos${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
          { signal },
        ),
      [username],
    ),
  );

  const tiles = useMemo(() => {
    const out: MediaTile[] = [];
    for (const post of list.items) {
      for (const m of post.media) {
        if (m.type === "image") out.push({ mediaId: m.id, url: m.url, post });
      }
    }
    return out;
  }, [list.items]);

  if (list.isLoading) {
    return (
      <div
        className="grid grid-cols-3 gap-1 sm:grid-cols-4"
        role="status"
        aria-label="Loading photos"
      >
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="skeleton aspect-square rounded-lg" />
        ))}
      </div>
    );
  }

  if (list.isError) {
    return (
      <ErrorState
        title="Couldn't load photos"
        description="Please try again in a moment."
        action={
          <Button variant="outline" size="sm" onClick={() => void list.refetch()}>
            Try again
          </Button>
        }
      />
    );
  }

  if (tiles.length === 0) {
    return (
      <EmptyState
        icon={<Images className="h-10 w-10" />}
        title="No photos yet."
        description={
          isSelf
            ? "Attach a photo to your next post and it will land here."
            : `Photos from @${username}'s posts will show up here.`
        }
      />
    );
  }

  return (
    <div className="grid grid-cols-3 gap-1 sm:grid-cols-4">
      {tiles.map((tile) => (
        <button
          key={tile.mediaId}
          type="button"
          onClick={() => onOpenPhoto(tile)}
          aria-label="Open photo"
          className="group relative aspect-square overflow-hidden rounded-lg bg-muted outline-none transition-transform duration-150 focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.98]"
        >
          <img
            src={tile.url}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
          />
          <span className="absolute inset-0 flex items-center justify-center gap-1 bg-black/50 text-sm font-semibold text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
            <Heart className="h-4 w-4 fill-current" aria-hidden="true" />
            {formatCount(tile.post.counts.reactions)}
          </span>
        </button>
      ))}
      {list.isFetchingNextPage && (
        <div className="skeleton aspect-square rounded-lg" />
      )}
      <div ref={list.sentinelRef} className="col-span-full" aria-hidden="true" />
    </div>
  );
}

// ─── Videos tab ──────────────────────────────────────────────────────────────

function ProfileVideosTab({
  username,
  isSelf,
  onOpenVideo,
}: {
  username: string;
  isSelf: boolean;
  onOpenVideo: (tile: MediaTile) => void;
}) {
  const list = useInfiniteList<PostDTO>(
    ["profile-posts", username, "videos"],
    useCallback(
      (cursor: string | null, signal: AbortSignal) =>
        api<Page<PostDTO>>(
          `/api/profiles/${encodeURIComponent(username)}/posts?tab=videos${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
          { signal },
        ),
      [username],
    ),
  );

  const tiles = useMemo(() => {
    const out: MediaTile[] = [];
    for (const post of list.items) {
      for (const m of post.media) {
        if (m.type === "video") out.push({ mediaId: m.id, url: m.url, post });
      }
    }
    return out;
  }, [list.items]);

  if (list.isLoading) {
    return (
      <div
        className="grid grid-cols-3 gap-1 sm:grid-cols-4"
        role="status"
        aria-label="Loading videos"
      >
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="skeleton aspect-square rounded-lg" />
        ))}
      </div>
    );
  }

  if (list.isError) {
    return (
      <ErrorState
        title="Couldn't load videos"
        description="Please try again in a moment."
        action={
          <Button variant="outline" size="sm" onClick={() => void list.refetch()}>
            Try again
          </Button>
        }
      />
    );
  }

  if (tiles.length === 0) {
    return (
      <EmptyState
        icon={<Film className="h-10 w-10" />}
        title="No videos yet."
        description={
          isSelf
            ? "Attach a video to your next post and it will land here."
            : `Videos from @${username}'s posts will show up here.`
        }
      />
    );
  }

  return (
    <div className="grid grid-cols-3 gap-1 sm:grid-cols-4">
      {tiles.map((tile) => (
        <button
          key={tile.mediaId}
          type="button"
          onClick={() => onOpenVideo(tile)}
          aria-label="Open video"
          className="group relative aspect-square overflow-hidden rounded-lg bg-muted outline-none transition-transform duration-150 focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.98]"
        >
          <video
            src={tile.url}
            preload="metadata"
            muted
            playsInline
            className="h-full w-full object-cover"
          />
          <span className="absolute inset-0 flex items-center justify-center gap-1 bg-black/50 text-sm font-semibold text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
            <Heart className="h-4 w-4 fill-current" aria-hidden="true" />
            {formatCount(tile.post.counts.reactions)}
          </span>
        </button>
      ))}
      {list.isFetchingNextPage && (
        <div className="skeleton aspect-square rounded-lg" />
      )}
      <div ref={list.sentinelRef} className="col-span-full" aria-hidden="true" />
    </div>
  );
}

// ─── ProfileView ─────────────────────────────────────────────────────────────

export default function ProfileView({ username }: { username: string }) {
  const queryClient = useQueryClient();

  const [tab, setTab] = useState<ProfileTab>("posts");
  const [editOpen, setEditOpen] = useState(false);
  const [followDialog, setFollowDialog] = useState<"followers" | "following" | null>(null);
  const [threadPost, setThreadPost] = useState<PostDTO | null>(null);
  const [lightbox, setLightbox] = useState<MediaTile | null>(null);
  const [videoBox, setVideoBox] = useState<MediaTile | null>(null);

  const profileQuery = useQuery({
    queryKey: ["profile", username],
    queryFn: ({ signal }) =>
      api<ProfileDetailDTO>(`/api/profiles/${encodeURIComponent(username)}`, { signal }),
    retry: (failureCount, err) =>
      err instanceof ApiError && err.status === 404 ? false : failureCount < 2,
  });
  const profile = profileQuery.data;
  const viewer = profile?.viewer;
  const canViewContent = viewer?.canViewContent ?? false;

  const copyLink = useCallback(() => {
    const url = `${window.location.origin}/#/profile/${encodeURIComponent(username)}`;
    navigator.clipboard
      ?.writeText(url)
      .then(() => toast.success("Profile link copied"))
      .catch(() => toast.error("Couldn't copy the link."));
  }, [username]);

  const handlePostDeleted = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["profile-posts", username] });
    void queryClient.invalidateQueries({ queryKey: ["profile", username] });
  }, [queryClient, username]);

  // ── Loading / error / 404 states ──
  if (profileQuery.isLoading) return <ProfileSkeleton />;

  if (profileQuery.isError) {
    if (profileQuery.error instanceof ApiError && profileQuery.error.status === 404) {
      return (
        <EmptyState
          className="mt-10"
          icon={<Sparkles className="h-10 w-10" />}
          title="This account doesn't exist… yet."
          description={`The handle @${username} is still up for grabs. Maybe it's meant to be yours?`}
        />
      );
    }
    return (
      <ErrorState
        className="mt-10"
        title="Couldn't load this profile"
        description="Please try again in a moment."
        action={
          <Button variant="outline" size="sm" onClick={() => void profileQuery.refetch()}>
            Try again
          </Button>
        }
      />
    );
  }

  if (!profile || !viewer) return null;

  // ── Profile header ──
  const header = (
    <header>
      <ProfileCover src={profile.coverUrl} name={profile.fullName} />

      {/* Avatar + actions + identity — actions wrap to a full-width row on mobile */}
      <div className="-mt-10 flex flex-wrap items-end gap-x-3 gap-y-3 md:-mt-12">
        <UserAvatar
          username={profile.username}
          fullName={profile.fullName}
          avatarUrl={profile.avatarUrl}
          size={96}
          linkToProfile={false}
          className="h-20! w-20! ring-4 ring-background md:h-24! md:w-24!"
        />

        {/* Secondary actions (share / more) */}
        <div className="order-2 ml-auto flex items-center gap-2 sm:order-3 sm:ml-2">
          {viewer.isSelf ? (
            <Button
              size="icon"
              variant="outline"
              className="h-10 w-10 shrink-0 rounded-full"
              onClick={copyLink}
              aria-label="Copy profile link"
            >
              <Share2 className="h-4 w-4" aria-hidden="true" />
            </Button>
          ) : (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="icon"
                  variant="outline"
                  className="h-10 w-10 shrink-0 rounded-full"
                  aria-label="More options"
                >
                  <Ellipsis className="h-4 w-4" aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={copyLink}>
                  <Copy className="h-4 w-4" aria-hidden="true" /> Copy profile link
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        {/* Primary action — full width on mobile, aligned right of the identity on desktop */}
        <div className="order-3 flex w-full min-w-[120px] sm:order-2 sm:ml-auto sm:w-auto">
          {viewer.isSelf ? (
            <Button
              className="h-10 w-full rounded-full px-5 font-semibold active:scale-[0.98] sm:w-auto"
              onClick={() => setEditOpen(true)}
            >
              <Pencil className="h-4 w-4" aria-hidden="true" /> Edit profile
            </Button>
          ) : (
            <FollowButton
              key={`${viewer.isFollowing}-${viewer.isRequested}`}
              username={profile.username}
              initialStatus={
                viewer.isFollowing ? "following" : viewer.isRequested ? "requested" : "none"
              }
              size="md"
              className="h-10 w-full px-5 sm:w-auto"
            />
          )}
        </div>

        {/* Identity */}
        <div className="order-4 w-full">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <h1 className="text-xl font-bold tracking-tight sm:text-2xl">{profile.fullName}</h1>
            {viewer.followsViewer && (
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                Follows you
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground">@{profile.username}</p>

          {profile.mood && (
            <span className="mt-2.5 inline-flex max-w-full items-center gap-1.5 rounded-full bg-brand-soft px-3 py-1 text-[13px] font-medium text-brand">
              <Sparkles className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span className="truncate">{profile.mood}</span>
            </span>
          )}

          {profile.bio && (
            <p className="mt-3 max-w-prose whitespace-pre-wrap text-[14.5px] leading-relaxed">
              {profile.bio}
            </p>
          )}

          <p className="mt-3 flex items-center gap-1.5 text-[13px] text-muted-foreground">
            <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
            Joined {joinedDate(profile.createdAt)}
          </p>

          {/* Counts */}
          <p className="mt-3 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm">
            <span>
              <span className="font-semibold text-foreground">{formatCount(profile.counts.posts)}</span>{" "}
              <span className="text-muted-foreground">posts</span>
            </span>
            <span className="text-muted-foreground" aria-hidden="true">
              ·
            </span>
            <button
              type="button"
              onClick={() => setFollowDialog("followers")}
              className="rounded outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={`View ${profile.fullName}'s followers`}
            >
              <span className="font-semibold text-foreground">{formatCount(profile.counts.followers)}</span>{" "}
              <span className="text-muted-foreground">followers</span>
            </button>
            <span className="text-muted-foreground" aria-hidden="true">
              ·
            </span>
            <button
              type="button"
              onClick={() => setFollowDialog("following")}
              className="rounded outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={`View who ${profile.fullName} follows`}
            >
              <span className="font-semibold text-foreground">{formatCount(profile.counts.following)}</span>{" "}
              <span className="text-muted-foreground">following</span>
            </button>
          </p>
        </div>
      </div>
    </header>
  );

  return (
    <article aria-label={`${profile.fullName}'s profile`}>
      {header}

      {/* Private gate */}
      {!canViewContent && (
        <div className="mt-6">
          <EmptyState
            icon={<Lock className="h-10 w-10" />}
            title="This account is private."
            description={
              viewer.isRequested
                ? "Your follow request is pending. If it's approved, their posts and photos will appear here."
                : `Follow @${profile.username} to see their posts and photos.`
            }
          />
        </div>
      )}

      {/* Content tabs — sticky, underline style */}
      {canViewContent && (
        <Tabs
          value={tab}
          onValueChange={(v) => setTab(v as ProfileTab)}
          className="mt-6"
        >
          <div className="glass sticky top-14 z-20 -mx-3 border-b px-3 md:-mx-6 md:top-0 md:px-6">
            <TabsList className="h-auto w-full rounded-none bg-transparent p-0">
              <TabsTrigger
                value="posts"
                className="relative h-11 rounded-none border-0 bg-transparent px-2 text-[13px] font-medium text-muted-foreground shadow-none transition-colors duration-200 hover:text-foreground focus-visible:ring-0 sm:px-3 sm:text-sm after:pointer-events-none after:absolute after:inset-x-2.5 after:bottom-0 after:h-0.5 after:rounded-full after:bg-transparent after:transition-colors after:content-[''] data-[state=active]:bg-transparent data-[state=active]:font-semibold data-[state=active]:text-foreground data-[state=active]:shadow-none dark:data-[state=active]:border-transparent dark:data-[state=active]:bg-transparent dark:data-[state=active]:text-foreground data-[state=active]:after:bg-brand"
              >
                Posts
              </TabsTrigger>
              <TabsTrigger
                value="photos"
                className="relative h-11 rounded-none border-0 bg-transparent px-2 text-[13px] font-medium text-muted-foreground shadow-none transition-colors duration-200 hover:text-foreground focus-visible:ring-0 sm:px-3 sm:text-sm after:pointer-events-none after:absolute after:inset-x-2.5 after:bottom-0 after:h-0.5 after:rounded-full after:bg-transparent after:transition-colors after:content-[''] data-[state=active]:bg-transparent data-[state=active]:font-semibold data-[state=active]:text-foreground data-[state=active]:shadow-none dark:data-[state=active]:border-transparent dark:data-[state=active]:bg-transparent dark:data-[state=active]:text-foreground data-[state=active]:after:bg-brand"
              >
                Photos
              </TabsTrigger>
              <TabsTrigger
                value="videos"
                className="relative h-11 rounded-none border-0 bg-transparent px-2 text-[13px] font-medium text-muted-foreground shadow-none transition-colors duration-200 hover:text-foreground focus-visible:ring-0 sm:px-3 sm:text-sm after:pointer-events-none after:absolute after:inset-x-2.5 after:bottom-0 after:h-0.5 after:rounded-full after:bg-transparent after:transition-colors after:content-[''] data-[state=active]:bg-transparent data-[state=active]:font-semibold data-[state=active]:text-foreground data-[state=active]:shadow-none dark:data-[state=active]:border-transparent dark:data-[state=active]:bg-transparent dark:data-[state=active]:text-foreground data-[state=active]:after:bg-brand"
              >
                Videos
              </TabsTrigger>
              <TabsTrigger
                value="about"
                className="relative h-11 rounded-none border-0 bg-transparent px-2 text-[13px] font-medium text-muted-foreground shadow-none transition-colors duration-200 hover:text-foreground focus-visible:ring-0 sm:px-3 sm:text-sm after:pointer-events-none after:absolute after:inset-x-2.5 after:bottom-0 after:h-0.5 after:rounded-full after:bg-transparent after:transition-colors after:content-[''] data-[state=active]:bg-transparent data-[state=active]:font-semibold data-[state=active]:text-foreground data-[state=active]:shadow-none dark:data-[state=active]:border-transparent dark:data-[state=active]:bg-transparent dark:data-[state=active]:text-foreground data-[state=active]:after:bg-brand"
              >
                About
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="posts" className="mt-4">
            <ProfilePostsTab
              username={profile.username}
              isSelf={viewer.isSelf}
              onOpenThread={setThreadPost}
              onPostDeleted={handlePostDeleted}
            />
          </TabsContent>

          <TabsContent value="photos" className="mt-4">
            <ProfilePhotosTab
              username={profile.username}
              isSelf={viewer.isSelf}
              onOpenPhoto={setLightbox}
            />
          </TabsContent>

          <TabsContent value="videos" className="mt-4">
            <ProfileVideosTab
              username={profile.username}
              isSelf={viewer.isSelf}
              onOpenVideo={setVideoBox}
            />
          </TabsContent>

          {/* About */}
          <TabsContent value="about" className="mt-4">
            <Card className="gap-0 rounded-2xl py-0 card-shadow">
              <CardContent className="divide-y divide-border p-5 sm:p-6">
                <section aria-label="Bio" className="pb-4">
                  <h2 className="text-sm font-semibold text-muted-foreground">Bio</h2>
                  {profile.bio ? (
                    <p className="mt-1.5 max-w-prose whitespace-pre-wrap text-[14.5px] leading-relaxed">
                      {profile.bio}
                    </p>
                  ) : (
                    <p className="mt-1.5 text-[14.5px] text-muted-foreground">
                      {viewer.isSelf
                        ? "Your bio is empty — tell people who you are."
                        : "No bio yet."}
                    </p>
                  )}
                </section>

                <section aria-label="Mood" className="py-4">
                  <h2 className="text-sm font-semibold text-muted-foreground">Mood</h2>
                  {profile.mood ? (
                    <span className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-brand-soft px-3 py-1 text-[13px] font-medium text-brand">
                      <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                      {profile.mood}
                    </span>
                  ) : (
                    <p className="mt-1.5 text-[14.5px] text-muted-foreground">
                      {viewer.isSelf
                        ? "Set a status so people know what you're up to."
                        : "No status set."}
                    </p>
                  )}
                </section>

                <section aria-label="Member since" className="py-4">
                  <h2 className="text-sm font-semibold text-muted-foreground">Joined</h2>
                  <p className="mt-1.5 flex items-center gap-1.5 text-[14.5px]">
                    <CalendarDays className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                    {joinedDate(profile.createdAt)}
                  </p>
                </section>

                <section aria-label="Activity" className="pt-4">
                  <h2 className="text-sm font-semibold text-muted-foreground">Activity</h2>
                  <div className="mt-3 grid grid-cols-3 gap-2.5">
                    {[
                      { value: formatCount(profile.counts.posts), label: "Posts" },
                      { value: formatCount(profile.counts.followers), label: "Followers" },
                      { value: formatCount(profile.counts.following), label: "Following" },
                    ].map((stat) => (
                      <div
                        key={stat.label}
                        className="rounded-xl bg-muted/60 px-2 py-3 text-center"
                      >
                        <p className="text-lg font-semibold tracking-tight text-foreground">
                          {stat.value}
                        </p>
                        <p className="text-xs text-muted-foreground">{stat.label}</p>
                      </div>
                    ))}
                  </div>
                </section>

                {viewer.isSelf && (
                  <div className="pt-4">
                    <Button
                      variant="outline"
                      className="w-full active:scale-[0.98] sm:w-auto"
                      onClick={() => setEditOpen(true)}
                    >
                      <Pencil className="h-4 w-4" aria-hidden="true" /> Edit profile
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}

      {/* Dialogs */}
      {viewer.isSelf ? (
        <EditProfileDialog open={editOpen} onClose={() => setEditOpen(false)} profile={profile} />
      ) : null}
      <FollowListDialog
        open={followDialog !== null}
        onClose={() => setFollowDialog(null)}
        username={profile.username}
        mode={followDialog ?? "followers"}
      />
      <ThreadModal post={threadPost} open={!!threadPost} onClose={() => setThreadPost(null)} />

      {/* Photo lightbox */}
      <Dialog open={!!lightbox} onOpenChange={(v) => (!v ? setLightbox(null) : undefined)}>
        <DialogContent className="overflow-hidden p-0 sm:max-w-xl">
          <DialogHeader className="sr-only">
            <DialogTitle>Photo</DialogTitle>
          </DialogHeader>
          {lightbox && (
            <>
              <img
                src={lightbox.url}
                alt={lightbox.post.content ? "Post photo" : "Photo"}
                className="max-h-[62svh] w-full bg-black object-contain"
              />
              <div className="px-5 pb-5 pt-4">
                {lightbox.post.content && (
                  <p className="line-clamp-3 whitespace-pre-wrap text-sm">{lightbox.post.content}</p>
                )}
                <div className="mt-3 flex items-center gap-3">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      const post = lightbox.post;
                      setLightbox(null);
                      setThreadPost(post);
                    }}
                  >
                    <MessageCircle className="h-4 w-4" aria-hidden="true" /> View post
                  </Button>
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Heart className="h-3.5 w-3.5" aria-hidden="true" />
                    {formatCount(lightbox.post.counts.reactions)}
                  </span>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Video player */}
      <Dialog open={!!videoBox} onOpenChange={(v) => (!v ? setVideoBox(null) : undefined)}>
        <DialogContent className="overflow-hidden p-0 sm:max-w-2xl">
          <DialogHeader className="sr-only">
            <DialogTitle>Video</DialogTitle>
          </DialogHeader>
          {videoBox && (
            <>
              <video
                src={videoBox.url}
                controls
                autoPlay
                playsInline
                className="max-h-[62svh] w-full bg-black"
              />
              <div className="px-5 pb-5 pt-4">
                {videoBox.post.content && (
                  <p className="line-clamp-3 whitespace-pre-wrap text-sm">{videoBox.post.content}</p>
                )}
                <div className="mt-3 flex items-center gap-3">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      const post = videoBox.post;
                      setVideoBox(null);
                      setThreadPost(post);
                    }}
                  >
                    <MessageCircle className="h-4 w-4" aria-hidden="true" /> View post
                  </Button>
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Heart className="h-3.5 w-3.5" aria-hidden="true" />
                    {formatCount(videoBox.post.counts.reactions)}
                  </span>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </article>
  );
}
