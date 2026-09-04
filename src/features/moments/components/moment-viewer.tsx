"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronLeft,
  ChevronRight,
  Eye,
  Loader2,
  SmilePlus,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { MOMENT_BACKGROUNDS, REACTIONS, reactionMeta } from "@/lib/constants";
import { formatCount, timeAgo } from "@/lib/format";
import { UserAvatar } from "@/components/user-avatar";
import { ProfileMiniCard } from "@/components/profile-mini-card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import type {
  MomentAuthorGroupDTO,
  MomentDTO,
  PollDTO,
  ProfileCardDTO,
  ReactionType,
} from "@/types";

const TEXT_SLIDE_MS = 5000;
const VIDEO_CAP_MS = 30000;

interface MomentStats {
  views: number;
  viewers: ProfileCardDTO[];
  reactions: { profile: ProfileCardDTO; type: ReactionType; createdAt: string }[];
}

interface ReactionState {
  count: number;
  mine: ReactionType | null;
}

/**
 * Fullscreen stories viewer: grouped progress bars, tap/keyboard navigation,
 * auto-advance, reactions (or insights + delete for your own moments).
 */
export function MomentViewer({
  groups,
  groupIndex,
  momentIndex = 0,
  onClose,
}: {
  groups: MomentAuthorGroupDTO[];
  groupIndex: number;
  momentIndex?: number;
  onClose: () => void;
}) {
  const [gi, setGi] = useState(() =>
    Math.min(Math.max(groupIndex, 0), Math.max(groups.length - 1, 0)),
  );
  const [mi, setMi] = useState(() => Math.max(momentIndex, 0));
  const [videoMs, setVideoMs] = useState<number | null>(null);
  const [pollOverrides, setPollOverrides] = useState<Record<string, PollDTO>>({});
  const [reactionMap, setReactionMap] = useState<Record<string, ReactionState>>({});
  const [expandedFor, setExpandedFor] = useState<string | null>(null);
  const [voting, setVoting] = useState(false);
  const [statsOpen, setStatsOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const seenRef = useRef<Set<string>>(new Set());
  const queryClient = useQueryClient();

  const group = groups[gi];
  const moment = group?.moments[Math.min(mi, group.moments.length - 1)];
  const momentId = moment?.id ?? null;
  const isSelf = group?.isSelf ?? false;

  // ── Navigation ──────────────────────────────────────────────────────────
  const next = useCallback(() => {
    if (!group) return;
    if (mi < group.moments.length - 1) {
      setMi(mi + 1);
      return;
    }
    if (gi < groups.length - 1) {
      setGi(gi + 1);
      setMi(0);
      return;
    }
    onClose();
  }, [group, gi, groups.length, mi, onClose]);

  const prev = useCallback(() => {
    if (mi > 0) {
      setMi(mi - 1);
      return;
    }
    if (gi > 0) {
      setGi(gi - 1);
      setMi(groups[gi - 1].moments.length - 1);
    }
  }, [gi, groups, mi]);

  // Keyboard navigation.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") {
        e.preventDefault();
        next();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        prev();
      } else if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, prev, onClose]);

  // Lock body scroll while the viewer is open.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  // Mark each moment seen once per open (fire-and-forget).
  useEffect(() => {
    if (!momentId || seenRef.current.has(momentId)) return;
    seenRef.current.add(momentId);
    void api(`/api/moments/${momentId}/view`, { method: "POST" }).catch(() => {});
  }, [momentId]);

  // ── Derived state ────────────────────────────────────────────────────────
  const pollState = useMemo(() => {
    if (!moment?.poll) return null;
    return pollOverrides[moment.poll.id] ?? moment.poll;
  }, [moment, pollOverrides]);

  const viewerVoted = !!pollState && pollState.options.some((o) => o.votedByViewer);
  const pollPending = !!pollState && !viewerVoted;
  const isVideo = moment?.type === "video";
  const reactionState: ReactionState | null = moment
    ? reactionMap[moment.id] ??
      (moment.reactionCount != null
        ? { count: moment.reactionCount, mine: moment.viewerReaction ?? null }
        : null)
    : null;
  const reactionsExpanded = !!moment && expandedFor === moment.id;
  const bgClass = moment
    ? (MOMENT_BACKGROUNDS.find((b) => b.id === moment.background)?.className ?? null)
    : null;
  const progressMs = isVideo ? (videoMs ?? VIDEO_CAP_MS) : TEXT_SLIDE_MS;

  // Auto-advance: text/image after 5s; poll waits for a vote; video on ended/30s cap.
  useEffect(() => {
    if (!moment || pollPending || isVideo) return;
    const t = setTimeout(next, TEXT_SLIDE_MS);
    return () => clearTimeout(t);
  }, [moment, pollPending, isVideo, next]);

  useEffect(() => {
    if (!isVideo || pollPending) return;
    const t = setTimeout(next, VIDEO_CAP_MS);
    return () => clearTimeout(t);
  }, [isVideo, pollPending, next]);

  if (!group || !moment) return null;

  // ── Actions ─────────────────────────────────────────────────────────────
  async function vote(optionId: string) {
    if (!moment?.poll || voting || viewerVoted) return;
    setVoting(true);
    try {
      const res = await api<{ poll: PollDTO }>(`/api/moments/${moment.id}/vote`, {
        body: { optionId },
      });
      setPollOverrides((p) => ({ ...p, [res.poll.id]: res.poll }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't record your vote.");
    } finally {
      setVoting(false);
    }
  }

  async function react(type: ReactionType) {
    if (!moment) return;
    const current: ReactionState = reactionState ?? { count: 0, mine: null };
    const removing = current.mine === type;
    const optimistic: ReactionState = {
      count: Math.max(0, current.count + (removing ? -1 : current.mine ? 0 : 1)),
      mine: removing ? null : type,
    };
    setReactionMap((p) => ({ ...p, [moment.id]: optimistic }));
    setExpandedFor(null);
    try {
      const res = await api<{ reactionCount: number; viewerReaction: ReactionType | null }>(
        `/api/moments/${moment.id}/reactions`,
        { body: { type } },
      );
      setReactionMap((p) => ({
        ...p,
        [moment.id]: { count: res.reactionCount, mine: res.viewerReaction },
      }));
    } catch (err) {
      setReactionMap((p) => ({ ...p, [moment.id]: current }));
      toast.error(err instanceof Error ? err.message : "Couldn't send that reaction.");
    }
  }

  async function deleteMoment() {
    if (!moment) return;
    setDeleting(true);
    try {
      await api(`/api/moments/${moment.id}`, { method: "DELETE" });
      toast.success("Moment deleted");
      setConfirmDelete(false);
      void queryClient.invalidateQueries({ queryKey: ["moments"] });
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't delete the moment.");
    } finally {
      setDeleting(false);
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black/95"
      role="dialog"
      aria-modal="true"
      aria-label={`${group.isSelf ? "Your" : group.author.fullName + "'s"} moments`}
    >
      {/* Top: grouped progress + author row */}
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-3 px-4 pt-4 sm:px-6">
        <div className="flex gap-1" key={moment.id} aria-hidden="true">
          {group.moments.map((m, i) => (
            <ProgressSegment
              key={m.id}
              state={i < mi ? "done" : i === mi ? "active" : "todo"}
              duration={progressMs}
              paused={pollPending && i === mi}
            />
          ))}
        </div>
        <div className="flex items-center gap-3">
          <UserAvatar
            username={group.author.username}
            fullName={group.author.fullName}
            avatarUrl={group.author.avatarUrl}
            size={38}
            linkToProfile={false}
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-white">
              {group.isSelf ? "Your moment" : group.author.fullName}
            </p>
            <p className="text-xs text-white/60">
              {timeAgo(moment.createdAt)} ago · gone in {timeAgo(moment.expiresAt)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close moments"
            className="flex h-11 w-11 items-center justify-center rounded-full text-white/80 transition hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
          >
            <X className="h-6 w-6" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="relative mx-auto flex w-full max-w-2xl flex-1 items-center justify-center px-2 py-3">
        <MomentBody
          moment={moment}
          pollState={pollState}
          voting={voting}
          bgClass={bgClass}
          onVote={vote}
          onVideoEnded={next}
          onVideoMeta={setVideoMs}
        />

        {/* Tap zones */}
        <button
          type="button"
          onClick={prev}
          aria-label="Previous moment"
          className="group absolute inset-y-0 left-0 flex w-1/4 items-center justify-start rounded-l-2xl pl-1 text-white/0 transition focus-visible:text-white/70 hover:text-white/70 focus-visible:outline-none"
        >
          <ChevronLeft className="h-9 w-9 drop-shadow" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={next}
          aria-label="Next moment"
          className="group absolute inset-y-0 right-0 flex w-1/4 items-center justify-end rounded-r-2xl pr-1 text-white/0 transition focus-visible:text-white/70 hover:text-white/70 focus-visible:outline-none"
        >
          <ChevronRight className="h-9 w-9 drop-shadow" aria-hidden="true" />
        </button>
      </div>

      {/* Footer */}
      <div className="mx-auto flex w-full max-w-2xl items-center justify-center gap-2 px-4 pb-6 sm:px-6">
        {isSelf ? (
          <>
            <button
              type="button"
              onClick={() => setStatsOpen(true)}
              className="glass flex h-11 items-center gap-2 rounded-full px-5 text-sm font-medium text-white transition hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
              aria-label="See who viewed your moment"
            >
              <Eye className="h-4 w-4" aria-hidden="true" />
              {formatCount(moment.viewCount ?? 0)} views
            </button>
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="glass flex h-11 w-11 items-center justify-center rounded-full text-white/85 transition hover:bg-white/15 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
              aria-label="Delete this moment"
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            </button>
          </>
        ) : (
          <ReactionBar
            state={reactionState}
            expanded={reactionsExpanded}
            onToggleExpand={() =>
              setExpandedFor(reactionsExpanded ? null : moment.id)
            }
            onReact={react}
          />
        )}
      </div>

      {/* Insights dialog (own moments) */}
      <Dialog open={statsOpen} onOpenChange={setStatsOpen}>
        <DialogContent className="scrollbar-slim max-h-[80vh] overflow-y-auto rounded-2xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Moment insights</DialogTitle>
          </DialogHeader>
          <MomentStatsContent
            momentId={moment.id}
            enabled={statsOpen}
          />
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this moment?</AlertDialogTitle>
            <AlertDialogDescription>
              This can&apos;t be undone — the moment disappears for everyone, right away.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Keep it</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void deleteMoment();
              }}
              disabled={deleting}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {deleting && <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Moment rendering ────────────────────────────────────────────────────────

function MomentBody({
  moment,
  pollState,
  voting,
  bgClass,
  onVote,
  onVideoEnded,
  onVideoMeta,
}: {
  moment: MomentDTO;
  pollState: PollDTO | null;
  voting: boolean;
  bgClass: string | null;
  onVote: (optionId: string) => void;
  onVideoEnded: () => void;
  onVideoMeta: (ms: number) => void;
}) {
  if (moment.type === "image" && moment.mediaUrl) {
    return (
      <div className="flex max-h-full flex-col items-center gap-3">
        <img
          src={moment.mediaUrl}
          alt={moment.content || "Moment photo"}
          loading="lazy"
          className="max-h-[68vh] w-auto max-w-full rounded-xl bg-white/5 object-contain"
        />
        {moment.content && (
          <p className="max-w-lg px-4 text-center text-sm text-white/85">{moment.content}</p>
        )}
      </div>
    );
  }

  if (moment.type === "video" && moment.mediaUrl) {
    return (
      <div className="flex max-h-full flex-col items-center gap-3">
        <video
          key={moment.id}
          src={moment.mediaUrl}
          autoPlay
          muted
          playsInline
          controls
          onEnded={onVideoEnded}
          onLoadedMetadata={(e) => {
            const d = e.currentTarget.duration;
            onVideoMeta(isFinite(d) && d > 0 ? Math.min(d * 1000, VIDEO_CAP_MS) : VIDEO_CAP_MS);
          }}
          className="max-h-[64vh] w-auto max-w-full rounded-xl"
        />
        {moment.content && (
          <p className="max-w-lg px-4 text-center text-sm text-white/85">{moment.content}</p>
        )}
      </div>
    );
  }

  if (moment.type === "poll" && pollState) {
    const viewerVoted = pollState.options.some((o) => o.votedByViewer);
    const total = Math.max(pollState.totalVotes, 0);
    return (
      <div className="flex w-full max-w-md flex-col gap-4">
        {moment.content && (
          <p className="text-center text-xl font-semibold leading-snug text-white">
            {moment.content}
          </p>
        )}
        <div className="flex flex-col gap-2" role="group" aria-label="Poll options">
          {pollState.options.map((o) => {
            const pct = total > 0 ? Math.round((o.voteCount / total) * 100) : 0;
            return (
              <button
                key={o.id}
                type="button"
                onClick={() => {
                  if (!viewerVoted) onVote(o.id);
                }}
                disabled={voting || viewerVoted}
                aria-label={viewerVoted ? `${o.text} — ${pct}%` : `Vote ${o.text}`}
                className={cn(
                  "glass rounded-xl px-4 py-3 text-left text-sm font-medium text-white transition hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60",
                  o.votedByViewer && "border border-brand/80 bg-white/15",
                  (voting || viewerVoted) && "cursor-default",
                )}
              >
                <span className="flex items-center justify-between gap-3">
                  <span>{o.text}</span>
                  {viewerVoted && (
                    <span className="tabular-nums text-white/70">{pct}%</span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
        <p className="text-center text-xs text-white/50">
          {pollState.totalVotes} {pollState.totalVotes === 1 ? "vote" : "votes"}
        </p>
      </div>
    );
  }

  // Text moment (and fallbacks) on a gradient stage.
  return (
    <div
      className={cn(
        "flex min-h-[55vh] w-full items-center justify-center rounded-2xl p-8",
        bgClass ?? "bg-gradient-to-br from-stone-700 via-stone-800 to-stone-950",
      )}
    >
      <p className="max-w-xl text-balance text-center text-2xl font-semibold leading-snug text-white sm:text-3xl">
        {moment.content || "✨"}
      </p>
    </div>
  );
}

function ProgressSegment({
  state,
  duration,
  paused,
}: {
  state: "done" | "active" | "todo";
  duration: number;
  paused?: boolean;
}) {
  const [go, setGo] = useState(false);

  useEffect(() => {
    if (state !== "active" || paused) return;
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => setGo(true));
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      setGo(false);
    };
  }, [state, paused]);

  return (
    <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/25">
      <div
        className={cn(
          "h-full rounded-full transition-colors",
          state === "active" ? "bg-brand" : "bg-white/80",
        )}
        style={{
          width: state === "done" ? "100%" : state === "active" && go ? "100%" : "0%",
          transition:
            state === "active" && !paused ? `width ${duration}ms linear` : undefined,
        }}
      />
    </div>
  );
}

function ReactionBar({
  state,
  expanded,
  onToggleExpand,
  onReact,
}: {
  state: ReactionState | null;
  expanded: boolean;
  onToggleExpand: () => void;
  onReact: (type: ReactionType) => void;
}) {
  return (
    <div className="glass flex items-center gap-1 rounded-full p-1.5">
      {expanded ? (
        REACTIONS.map((r) => (
          <button
            key={r.type}
            type="button"
            onClick={() => onReact(r.type)}
            aria-label={`React with ${r.label}`}
            className="flex h-10 w-10 items-center justify-center rounded-full text-2xl transition hover:scale-125 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
          >
            <span role="img" aria-hidden="true">
              {r.emoji}
            </span>
          </button>
        ))
      ) : (
        <>
          {state && state.count > 0 && (
            <span className="flex items-center gap-1 pl-3 pr-1 text-sm font-medium text-white">
              <span aria-hidden="true">{state.mine ? reactionMeta(state.mine).emoji : "❤️"}</span>
              {formatCount(state.count)}
            </span>
          )}
          <button
            type="button"
            onClick={() => onReact("LOVE")}
            aria-label="React with love"
            className="flex h-10 w-10 items-center justify-center rounded-full text-xl transition hover:scale-110 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
          >
            <span role="img" aria-hidden="true">
              ❤️
            </span>
          </button>
          <button
            type="button"
            onClick={onToggleExpand}
            aria-label="More reactions"
            className="flex h-10 w-10 items-center justify-center rounded-full text-white/80 transition hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
          >
            <SmilePlus className="h-5 w-5" aria-hidden="true" />
          </button>
        </>
      )}
    </div>
  );
}

function MomentStatsContent({
  momentId,
  enabled,
}: {
  momentId: string;
  enabled: boolean;
}) {
  const stats = useQuery<MomentStats>({
    queryKey: ["moment-stats", momentId],
    queryFn: () => api<MomentStats>(`/api/moments/${momentId}/stats`),
    enabled,
  });

  if (stats.isLoading) {
    return (
      <div className="space-y-2" aria-label="Loading insights">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-12 w-full rounded-xl" />
        ))}
      </div>
    );
  }
  if (stats.isError || !stats.data) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        Insights couldn&apos;t load right now.
      </p>
    );
  }

  const { views, viewers, reactions } = stats.data;
  return (
    <div className="space-y-5">
      <section aria-label="Viewers">
        <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold text-muted-foreground">
          <Eye className="h-4 w-4" aria-hidden="true" /> {formatCount(views)}{" "}
          {views === 1 ? "view" : "views"}
        </h3>
        {viewers.length === 0 ? (
          <p className="py-3 text-sm text-muted-foreground">
            No views yet — share more moments so people spot you in the row.
          </p>
        ) : (
          <div className="divide-y divide-border/60">
            {viewers.map((v) => (
              <ProfileMiniCard key={v.userId} profile={v} />
            ))}
          </div>
        )}
      </section>
      <section aria-label="Reactions">
        <h3 className="mb-1 text-sm font-semibold text-muted-foreground">Reactions</h3>
        {reactions.length === 0 ? (
          <p className="py-3 text-sm text-muted-foreground">No reactions yet.</p>
        ) : (
          <div className="divide-y divide-border/60">
            {reactions.map((r, i) => (
              <div key={`${r.profile.userId}-${i}`} className="flex items-center gap-3 py-2">
                <UserAvatar
                  username={r.profile.username}
                  fullName={r.profile.fullName}
                  avatarUrl={r.profile.avatarUrl}
                  size={36}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold leading-tight">
                    {r.profile.fullName}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    @{r.profile.username} · {timeAgo(r.createdAt)} ago
                  </p>
                </div>
                <span
                  className="text-xl"
                  role="img"
                  aria-label={reactionMeta(r.type).label}
                  title={reactionMeta(r.type).label}
                >
                  {reactionMeta(r.type).emoji}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
