"use client";

import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { useQueryClient } from "@tanstack/react-query";
import { useHashRoute, matchRoute, navigateTo } from "@/lib/router";
import { useSession } from "@/lib/session-store";
import { useRealtimeNotifications } from "@/lib/realtime";
import { api } from "@/lib/api";
import { toast } from "sonner";
import {
  KIVO_NOTIFICATION_EVENT,
  UNREAD_COUNT_KEY,
} from "@/features/notifications/lib/notifications-client";
import { CinematicSplash } from "@/components/splash/cinematic-splash";
import { AppShell } from "@/components/app-shell";
import { ThreadModal } from "@/features/comments/components/thread-modal";
import type { NotificationDTO, PostDTO } from "@/types";

// ─── Lazy views (code splitting) ─────────────────────────────────────────────
import LoginView from "@/features/auth/views/login-view";
import SignupView from "@/features/auth/views/signup-view";
import VerifyEmailView from "@/features/auth/views/verify-email-view";
import ForgotPasswordView from "@/features/auth/views/forgot-password-view";
import ResetPasswordView from "@/features/auth/views/reset-password-view";
import LandingView from "@/features/auth/views/landing-view";

const HomeView = lazy(() => import("@/features/feed/views/home-view"));
const ExploreView = lazy(() => import("@/features/search/views/explore-view"));
const HashtagView = lazy(() => import("@/features/search/views/hashtag-view"));
const NotificationsView = lazy(() => import("@/features/notifications/views/notifications-view"));
const SavedView = lazy(() => import("@/features/saved/views/saved-view"));
const CollectionView = lazy(() => import("@/features/saved/views/collection-view"));
const SpacesView = lazy(() => import("@/features/spaces/views/spaces-view"));
const SpaceDetailView = lazy(() => import("@/features/spaces/views/space-detail-view"));
const ProfileView = lazy(() => import("@/features/profile/views/profile-view"));
const SettingsView = lazy(() => import("@/features/settings/views/settings-view"));
const PostComposerModal = lazy(() => import("@/features/posts/components/post-composer-modal"));
const RightRail = lazy(() =>
  import("@/features/search/components/right-rail").then((m) => ({ default: m.RightRail })),
);

/**
 * Crossfades the app in while the splash curtain lifts. Opacity-only so no
 * transform containing-block interferes with fixed/sticky app chrome.
 */
function AppReveal({
  active,
  reduce,
  children,
}: {
  active: boolean;
  reduce: boolean;
  children: React.ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: active ? 1 : 0 }}
      transition={{ duration: reduce ? 0.01 : 0.65, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}

function ViewFallback() {
  return (
    <div className="flex flex-1 flex-col gap-4 py-2" aria-hidden="true">
      <div className="flex items-center gap-3">
        <div className="skeleton h-10 w-10 rounded-full" />
        <div className="flex flex-col gap-1.5">
          <div className="skeleton h-3.5 w-32 rounded-full" />
          <div className="skeleton h-3 w-20 rounded-full" />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <div className="skeleton h-3.5 w-full rounded-full" />
        <div className="skeleton h-3.5 w-4/5 rounded-full" />
      </div>
      <div className="skeleton h-44 w-full rounded-2xl" />
    </div>
  );
}

/** Opens any post's thread from anywhere (used by notifications deep-links). */
function GlobalThreadOpener() {
  const [post, setPost] = useState<PostDTO | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const onOpenThread = (e: Event) => {
      const postId = (e as CustomEvent<{ postId?: string }>).detail?.postId;
      if (!postId) return;
      void api<PostDTO>(`/api/posts/${postId}`)
        .then((p) => {
          if (cancelled) return;
          setPost(p);
          setOpen(true);
        })
        .catch(() => {
          // post may be gone or private — stay quiet
        });
    };
    window.addEventListener("kivo:open-thread", onOpenThread);
    return () => {
      cancelled = true;
      window.removeEventListener("kivo:open-thread", onOpenThread);
    };
  }, []);

  return <ThreadModal post={post} open={open} onClose={() => setOpen(false)} />;
}

/** Realtime notifications: badge + toast + query refresh. */
function useRealtime() {
  const status = useSession((s) => s.status);
  const queryClient = useQueryClient();
  const lastRefresh = useRef(0);

  const onNotification = useCallback(
    (n: NotificationDTO) => {
      window.dispatchEvent(new CustomEvent(KIVO_NOTIFICATION_EVENT));
      void queryClient.invalidateQueries({ queryKey: UNREAD_COUNT_KEY });
      const now = Date.now();
      if (now - lastRefresh.current > 3000) {
        lastRefresh.current = now;
        void queryClient.invalidateQueries({ queryKey: ["notifications"] });
      }
      const who = n.actor?.fullName ?? "Someone";
      const what = NOTIFICATION_COPY[n.type] ?? "sent you a notification";
      toast(`${who} ${what}`, {
        description: n.preview ?? n.postPreview ?? undefined,
      });
    },
    [queryClient],
  );

  useRealtimeNotifications(onNotification);

  // Prime the unread badge once authenticated
  useEffect(() => {
    if (status !== "authenticated") return;
    void queryClient.invalidateQueries({ queryKey: UNREAD_COUNT_KEY });
  }, [status, queryClient]);
}

const NOTIFICATION_COPY: Record<string, string> = {
  reaction: "reacted to your post",
  comment: "commented on your post",
  reply: "replied to your comment",
  follow: "started following you",
  follow_request: "requested to follow you",
  follow_accept: "accepted your follow request",
  mention: "mentioned you in a post",
  space_post: "posted in a space you're in",
};

export default function Home() {
  const { path } = useHashRoute();
  const { status, refresh } = useSession();
  const route = matchRoute(path);
  const queryClient = useQueryClient();
  const reduce = useReducedMotion() ?? false;

  // Splash lifecycle: intro plays fully → curtain lifts once auth resolves →
  // app crossfades in lockstep (reveal) → overlay unmounts (splashGone).
  const [reveal, setReveal] = useState(false);
  const [splashGone, setSplashGone] = useState(false);
  const handleSplashExitStart = useCallback(() => setReveal(true), []);
  const handleSplashFinish = useCallback(() => setSplashGone(true), []);

  useRealtime();

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Reset per-route query state when leaving the app (logout) — handled by store.
  useEffect(() => {
    if (status === "unauthenticated") {
      void queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== "notifications" });
    }
  }, [status, queryClient]);

  // Auth routes while signed in → go home
  useEffect(() => {
    if (
      status === "authenticated" &&
      ["login", "signup", "verify-email", "forgot-password"].includes(route.name)
    ) {
      navigateTo("/", { replace: true });
    }
  }, [status, route.name]);

  const appReady = status !== "loading";
  const showRightRail = route.name === "home" || route.name === "explore";

  const view = (() => {
    switch (route.name) {
      case "home":
        return <HomeView />;
      case "explore":
        return <ExploreView />;
      case "hashtag":
        return <HashtagView tag={route.params.tag} />;
      case "notifications":
        return <NotificationsView />;
      case "saved":
        return <SavedView />;
      case "saved-collection":
        return <CollectionView collectionId={route.params.collectionId} />;
      case "spaces":
        return <SpacesView />;
      case "space-detail":
        return <SpaceDetailView slug={route.params.slug} />;
      case "profile":
        return <ProfileView username={route.params.username} />;
      case "settings":
        return <SettingsView />;
      default:
        return (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 py-24 text-center">
            <p className="text-5xl" aria-hidden="true">🧭</p>
            <p className="text-lg font-semibold">This page wandered off.</p>
            <p className="text-sm text-muted-foreground">
              The link may be broken — head back home to keep scrolling.
            </p>
          </div>
        );
    }
  })();

  // What the app should show once the auth state is known. Rendered beneath
  // the splash overlay so the curtain lifts onto a ready, warm app.
  const content = (() => {
    const authViews: Record<string, React.ReactNode> = {
      login: <LoginView />,
      signup: <SignupView />,
      "verify-email": <VerifyEmailView />,
      "forgot-password": <ForgotPasswordView />,
      "reset-password": <ResetPasswordView />,
    };
    if (authViews[route.name]) return authViews[route.name];

    if (status === "unauthenticated") {
      return route.name === "home" ? <LandingView /> : <LoginView />;
    }

    return (
      <>
        <AppShell path={path} rightRail={showRightRail ? <RightRail /> : undefined}>
          <Suspense fallback={<ViewFallback />}>{view}</Suspense>
        </AppShell>
        <Suspense fallback={null}>
          <PostComposerModal />
        </Suspense>
        <GlobalThreadOpener />
      </>
    );
  })();

  return (
    <>
      {appReady && (
        <AppReveal active={reveal || splashGone} reduce={reduce}>
          {content}
        </AppReveal>
      )}
      {!splashGone && (
        <CinematicSplash
          resolved={appReady}
          onExitStart={handleSplashExitStart}
          onFinish={handleSplashFinish}
        />
      )}
    </>
  );
}
