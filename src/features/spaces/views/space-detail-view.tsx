"use client";
/* eslint-disable react-hooks/refs -- useInfiniteList returns sentinelRef mixed with plain react-query state; reads below are query state, and sentinelRef is only ever attached to a DOM node (its documented contract). */

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarDays,
  Check,
  Crown,
  FileText,
  Megaphone,
  Pencil,
  PenLine,
  Plus,
  SearchX,
  Settings2,
  Sparkles,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api";
import { navigateTo } from "@/lib/router";
import { formatCount, initials, joinedDate } from "@/lib/format";
import { useInfiniteList, makePageFetcher } from "@/hooks/use-infinite";
import { useComposer } from "@/lib/ui-store";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState, ErrorState } from "@/components/empty-state";
import { ProfileMiniCard } from "@/components/profile-mini-card";
import { UserAvatar } from "@/components/user-avatar";
import { PostCard, PostCardSkeleton } from "@/features/posts/components/post-card";
import { ThreadModal } from "@/features/comments/components/thread-modal";
import { EditSpaceDialog } from "@/features/spaces/components/edit-space-dialog";
import type { Page, PostDTO, SpaceDTO, SpaceMemberDTO } from "@/types";

/** Full space page: header, announcement, feed / about / members. */
export default function SpaceDetailView({ slug }: { slug: string }) {
  const queryClient = useQueryClient();
  const openComposer = useComposer((s) => s.openComposer);
  const [editOpen, setEditOpen] = useState(false);
  const [memberBusy, setMemberBusy] = useState(false);
  const [threadPost, setThreadPost] = useState<PostDTO | null>(null);

  const detail = useQuery<SpaceDTO, ApiError>({
    queryKey: ["space", slug],
    queryFn: () => api<SpaceDTO>(`/api/spaces/${slug}`),
  });

  const space = detail.data;

  async function toggleMembership() {
    if (!space || memberBusy) return;
    const isMember = space.viewer.isMember;
    setMemberBusy(true);
    // Optimistic: flip membership + adjust count.
    queryClient.setQueryData<SpaceDTO>(["space", slug], (old) =>
      old
        ? {
            ...old,
            counts: {
              ...old.counts,
              members: Math.max(0, old.counts.members + (isMember ? -1 : 1)),
            },
            viewer: {
              isMember: !isMember,
              role: !isMember ? "MEMBER" : null,
            },
          }
        : old,
    );
    try {
      if (isMember) {
        await api<{ isMember: boolean }>(`/api/spaces/${slug}/leave`, { method: "POST" });
        toast(`You left ${space.name}`);
      } else {
        await api<{ isMember: boolean }>(`/api/spaces/${slug}/join`, { method: "POST" });
        toast.success(`Welcome to ${space.name}!`);
      }
      void queryClient.invalidateQueries({ queryKey: ["spaces"] });
    } catch (err) {
      void queryClient.invalidateQueries({ queryKey: ["space", slug] }); // rollback
      toast.error(err instanceof Error ? err.message : "That didn't work. Try again.");
    } finally {
      setMemberBusy(false);
    }
  }

  if (detail.isLoading) return <SpaceDetailSkeleton />;

  if (detail.isError || !space) {
    const notFound = detail.error?.code === "NOT_FOUND" || detail.error?.status === 404;
    return (
      <div className="mx-auto w-full max-w-4xl px-4 py-16">
        <EmptyState
          icon={<SearchX className="h-10 w-10" aria-hidden="true" />}
          title={notFound ? "Space not found" : "This space couldn't load"}
          description={
            notFound
              ? "It may have been removed, or the link is off by a letter."
              : "Check your connection and try again."
          }
          action={
            <Button variant="outline" className="rounded-full" onClick={() => navigateTo("/spaces")}>
              Browse spaces
            </Button>
          }
        />
      </div>
    );
  }

  const isOwner = space.viewer.role === "OWNER";

  return (
    <div className="mx-auto w-full max-w-4xl px-4 pb-10 pt-6">
      {/* Header card */}
      <section
        className="card-shadow overflow-hidden rounded-2xl border bg-card"
        aria-label={`${space.name} space`}
      >
        <div className="h-40 w-full bg-muted">
          {space.coverUrl ? (
             
            <img
              src={space.coverUrl}
              alt={`${space.name} cover`}
              className="h-full w-full object-cover"
            />
          ) : (
            <div
              className="h-full w-full bg-gradient-to-br from-brand-soft via-accent to-brand-soft"
              aria-hidden="true"
            />
          )}
        </div>

        <div className="px-5 pb-5">
          <div className="-mt-9 mb-3 flex items-end justify-between gap-3">
            {space.avatarUrl ? (
               
              <img
                src={space.avatarUrl}
                alt={`${space.name} avatar`}
                className="h-[4.5rem] w-[4.5rem] rounded-full border-4 border-card bg-muted object-cover"
              />
            ) : (
              <span
                className="flex h-[4.5rem] w-[4.5rem] items-center justify-center rounded-full border-4 border-card bg-brand-soft text-xl font-bold text-brand"
                aria-hidden="true"
              >
                {initials(space.name)}
              </span>
            )}

            <div className="mb-1 flex items-center gap-2">
              {isOwner ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="rounded-full font-semibold">
                      <Settings2 className="h-4 w-4" aria-hidden="true" /> Manage
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => setEditOpen(true)}>
                      <Pencil className="h-4 w-4" aria-hidden="true" /> Edit space
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <Button
                  variant={space.viewer.isMember ? "secondary" : "default"}
                  className="rounded-full font-semibold active:scale-[0.98]"
                  onClick={() => void toggleMembership()}
                  disabled={memberBusy}
                  aria-label={space.viewer.isMember ? `Leave ${space.name}` : `Join ${space.name}`}
                >
                  {space.viewer.isMember ? (
                    <Check className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <Plus className="h-4 w-4" aria-hidden="true" />
                  )}
                  {space.viewer.isMember ? "Joined" : "Join"}
                </Button>
              )}
            </div>
          </div>

          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">{space.name}</h1>
          {space.description && (
            <p className="mt-1 text-sm text-muted-foreground">{space.description}</p>
          )}
          <div className="mt-2 flex items-center gap-4 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Users className="h-3.5 w-3.5" aria-hidden="true" />
              {formatCount(space.counts.members)} members
            </span>
            <span className="inline-flex items-center gap-1">
              <FileText className="h-3.5 w-3.5" aria-hidden="true" />
              {formatCount(space.counts.posts)} posts
            </span>
          </div>
        </div>
      </section>

      {/* Announcement banner (members only) */}
      {space.announcement && space.viewer.isMember && (
        <div className="mt-4 flex items-start gap-3 rounded-xl border-l-2 border-brand bg-brand-soft/40 p-3.5">
          <Megaphone className="mt-0.5 h-4 w-4 shrink-0 text-brand" aria-hidden="true" />
          <p className="whitespace-pre-wrap text-sm">{space.announcement}</p>
        </div>
      )}

      <Tabs defaultValue="feed" className="mt-5">
        <TabsList className="h-auto justify-start gap-6 rounded-none border-b bg-transparent p-0">
          <TabsTrigger
            value="feed"
            className="h-auto flex-none rounded-none border-0 border-b-2 border-transparent bg-transparent px-1 pb-2.5 pt-1 text-sm font-medium text-muted-foreground shadow-none transition-colors duration-150 hover:text-foreground data-[state=active]:border-brand data-[state=active]:bg-transparent data-[state=active]:font-semibold data-[state=active]:text-foreground data-[state=active]:shadow-none dark:data-[state=active]:border-brand dark:data-[state=active]:bg-transparent"
          >
            Feed
          </TabsTrigger>
          <TabsTrigger
            value="about"
            className="h-auto flex-none rounded-none border-0 border-b-2 border-transparent bg-transparent px-1 pb-2.5 pt-1 text-sm font-medium text-muted-foreground shadow-none transition-colors duration-150 hover:text-foreground data-[state=active]:border-brand data-[state=active]:bg-transparent data-[state=active]:font-semibold data-[state=active]:text-foreground data-[state=active]:shadow-none dark:data-[state=active]:border-brand dark:data-[state=active]:bg-transparent"
          >
            About
          </TabsTrigger>
          <TabsTrigger
            value="members"
            className="h-auto flex-none rounded-none border-0 border-b-2 border-transparent bg-transparent px-1 pb-2.5 pt-1 text-sm font-medium text-muted-foreground shadow-none transition-colors duration-150 hover:text-foreground data-[state=active]:border-brand data-[state=active]:bg-transparent data-[state=active]:font-semibold data-[state=active]:text-foreground data-[state=active]:shadow-none dark:data-[state=active]:border-brand dark:data-[state=active]:bg-transparent"
          >
            Members
          </TabsTrigger>
        </TabsList>

        <TabsContent value="feed" className="mt-4">
          {!space.viewer.isMember && (
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-brand/30 bg-brand-soft px-4 py-3">
              <p className="text-sm font-medium">Join to post in this space.</p>
              <Button
                size="sm"
                className="rounded-full font-semibold active:scale-[0.98]"
                onClick={() => void toggleMembership()}
                disabled={memberBusy}
              >
                <Plus className="h-4 w-4" aria-hidden="true" /> Join
              </Button>
            </div>
          )}
          {space.viewer.isMember && (
            <button
              type="button"
              onClick={() => openComposer({ id: space.id, name: space.name })}
              className="mb-4 flex w-full items-center gap-3 rounded-xl border bg-card px-4 py-3 text-left text-sm text-muted-foreground transition-all duration-200 hover:border-brand/40 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={`Write a post in ${space.name}`}
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-soft text-brand">
                <PenLine className="h-4 w-4" aria-hidden="true" />
              </span>
              Share something with {space.name}…
            </button>
          )}
          <SpaceFeed slug={slug} onOpenThread={setThreadPost} />
        </TabsContent>

        <TabsContent value="about" className="mt-4">
          <SpaceAbout space={space} />
        </TabsContent>

        <TabsContent value="members" className="mt-4">
          <SpaceMembers slug={slug} />
        </TabsContent>
      </Tabs>

      <EditSpaceDialog space={space} open={editOpen} onClose={() => setEditOpen(false)} />
      <ThreadModal post={threadPost} open={!!threadPost} onClose={() => setThreadPost(null)} />
    </div>
  );
}

// ─── Feed ────────────────────────────────────────────────────────────────────

function SpaceFeed({
  slug,
  onOpenThread,
}: {
  slug: string;
  onOpenThread: (post: PostDTO) => void;
}) {
  const queryClient = useQueryClient();
  const feed = useInfiniteList<PostDTO>(
    ["space-posts", slug],
    makePageFetcher<PostDTO>(
      (cursor) => `/api/spaces/${slug}/posts${cursor ? `?cursor=${cursor}` : ""}`,
    ),
  );

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ["space-posts", slug] });
  }

  if (feed.isLoading) {
    return (
      <div className="space-y-4" aria-label="Loading posts">
        <PostCardSkeleton />
        <PostCardSkeleton />
        <PostCardSkeleton />
      </div>
    );
  }

  if (feed.isError) {
    return (
      <ErrorState
        title="Posts couldn't load"
        description="Check your connection and try again."
        action={
          <Button variant="outline" onClick={() => void feed.refetch()}>
            Try again
          </Button>
        }
      />
    );
  }

  if (feed.items.length === 0) {
    return (
      <EmptyState
        icon={<Sparkles className="h-10 w-10" aria-hidden="true" />}
        title="It's quiet in here."
        description="No posts in this space yet — be the first to start things off."
      />
    );
  }

  return (
    <div className="space-y-4">
      {feed.items.map((post) => (
        <PostCard
          key={post.id}
          post={post}
          onOpenThread={onOpenThread}
          onPostChanged={invalidate}
          onPostDeleted={invalidate}
        />
      ))}
      <div ref={feed.sentinelRef} aria-hidden="true" />
      {feed.isFetchingNextPage && (
        <p className="py-3 text-center text-sm text-muted-foreground">Loading more…</p>
      )}
    </div>
  );
}

// ─── About ───────────────────────────────────────────────────────────────────

function SpaceAbout({ space }: { space: SpaceDTO }) {
  const members = useQuery<Page<SpaceMemberDTO>>({
    queryKey: ["space-members", space.slug, "first"],
    queryFn: () => api<Page<SpaceMemberDTO>>(`/api/spaces/${space.slug}/members?limit=20`),
  });
  const owner = members.data?.items.find((m) => m.role === "OWNER")?.profile;

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Description</CardTitle>
        </CardHeader>
        <CardContent>
          {space.description ? (
            <p className="whitespace-pre-wrap text-sm">{space.description}</p>
          ) : (
            <p className="text-sm italic text-muted-foreground">No description yet.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Rules</CardTitle>
        </CardHeader>
        <CardContent>
          {space.rules ? (
            <ol className="flex flex-col gap-3">
              {space.rules
                .split("\n")
                .map((r) => r.trim())
                .filter(Boolean)
                .map((rule, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <span
                      aria-hidden
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold tabular-nums text-muted-foreground"
                    >
                      {i + 1}
                    </span>
                    <span className="pt-0.5 text-sm leading-relaxed">{rule}</span>
                  </li>
                ))}
            </ol>
          ) : (
            <p className="text-sm italic text-muted-foreground">No rules yet — be kind.</p>
          )}
        </CardContent>
      </Card>

      <Card className="md:col-span-2">
        <CardHeader>
          <CardTitle className="text-base">Info</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2 text-sm">
            <CalendarDays className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            Created {joinedDate(space.createdAt)}
          </div>
          <Separator />
          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Owner
            </p>
            {owner ? (
              <ProfileMiniCard profile={owner} />
            ) : (
              <div className="skeleton h-12 w-full rounded-xl" />
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Members ─────────────────────────────────────────────────────────────────

function SpaceMembers({ slug }: { slug: string }) {
  const members = useInfiniteList<SpaceMemberDTO>(
    ["space-members", slug],
    makePageFetcher<SpaceMemberDTO>(
      (cursor) => `/api/spaces/${slug}/members${cursor ? `?cursor=${cursor}` : ""}`,
    ),
  );

  if (members.isLoading) {
    return (
      <div className="space-y-1" aria-label="Loading members">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="skeleton h-14 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  if (members.isError) {
    return (
      <ErrorState
        title="Members couldn't load"
        action={
          <Button variant="outline" onClick={() => void members.refetch()}>
            Try again
          </Button>
        }
      />
    );
  }

  if (members.items.length === 0) {
    return (
      <EmptyState
        icon={<Users className="h-10 w-10" aria-hidden="true" />}
        title="No members yet."
        description="Once people join, they'll show up here."
      />
    );
  }

  return (
    <div className="rounded-2xl border bg-card px-4 py-2">
      {members.items.map((m) => (
        <div key={m.profile.userId} className="flex items-center justify-between gap-3">
          <ProfileMiniCard
            profile={m.profile}
            role={m.role === "OWNER" ? "Owner" : undefined}
          />
          <Badge
            variant={m.role === "OWNER" ? "default" : "secondary"}
            className="shrink-0 rounded-full font-semibold"
          >
            {m.role === "OWNER" && <Crown className="mr-1 h-3 w-3" aria-hidden="true" />}
            {m.role}
          </Badge>
        </div>
      ))}
      <div ref={members.sentinelRef} aria-hidden="true" />
      {members.isFetchingNextPage && (
        <p className="py-3 text-center text-sm text-muted-foreground">Loading more…</p>
      )}
    </div>
  );
}

// ─── Skeleton ────────────────────────────────────────────────────────────────

function SpaceDetailSkeleton() {
  return (
    <div className="mx-auto w-full max-w-4xl px-4 pb-10 pt-6" aria-label="Loading space">
      <div className="overflow-hidden rounded-2xl border bg-card">
        <div className="skeleton h-40 w-full" />
        <div className="px-5 pb-5">
          <div className="skeleton -mt-9 mb-3 h-[4.5rem] w-[4.5rem] rounded-full border-4 border-card" />
          <div className="skeleton h-6 w-1/2 rounded-md" />
          <div className="skeleton mt-2 h-4 w-3/4 rounded-md" />
          <div className="skeleton mt-2 h-3 w-1/3 rounded-md" />
        </div>
      </div>
      <div className="skeleton mt-5 h-10 w-64 rounded-full" />
      <div className="skeleton mt-4 h-24 w-full rounded-xl" />
    </div>
  );
}
