"use client";

import { useEffect, useRef, useState } from "react";
import {
  AnimatePresence,
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
} from "framer-motion";
import {
  Bell,
  Bookmark,
  Compass,
  Flame,
  Home,
  Lock,
  MessageCircle,
  Share2,
  Sparkles,
  User as UserIcon,
  Users,
} from "lucide-react";
import { KivoBrand } from "@/components/kivo-brand";
import { cn } from "@/lib/utils";

/**
 * Code-rendered interactive preview of the KIVO app: a floating glassmorphic
 * browser frame containing a mock feed with a working mood selector, an AI
 * summary chip, a cycling realtime toast and a floating AI badge. Desktop
 * pointers get a gentle 3D tilt; everything is CSS/SVG — zero image assets.
 */

type Mood = "tech" | "chill" | "motivate";

const MOODS: Record<
  Mood,
  { label: string; dot: string; active: string; tag: string; tagColor: string; name: string; handle: string; initials: string; avatar: string; text: string }
> = {
  tech: {
    label: "Tech",
    dot: "bg-amber-300",
    active: "border-amber-400/30 bg-amber-400/10 text-amber-200",
    tag: "#webdev",
    tagColor: "text-amber-300/90",
    name: "Arian Khan",
    handle: "@arian",
    initials: "AK",
    avatar: "from-amber-400/80 to-orange-600/80",
    text: "Cold starts down 92% after moving to the edge runtime. Wrote up the whole journey — benchmarks, mistakes and all.",
  },
  chill: {
    label: "Chill",
    dot: "bg-teal-300",
    active: "border-teal-300/30 bg-teal-300/10 text-teal-100",
    tag: "#slowliving",
    tagColor: "text-teal-300/90",
    name: "Lena Gomez",
    handle: "@lena",
    initials: "LG",
    avatar: "from-teal-300/80 to-emerald-600/80",
    text: "Slow morning, vinyl on, best pour-over of the month. Notifications off for one hour — the world can wait.",
  },
  motivate: {
    label: "Motivation",
    dot: "bg-orange-400",
    active: "border-orange-400/30 bg-orange-400/10 text-orange-200",
    tag: "#buildinpublic",
    tagColor: "text-orange-300/90",
    name: "Ravi Chowdhury",
    handle: "@ravi",
    initials: "RC",
    avatar: "from-orange-400/80 to-rose-600/80",
    text: "Day 41 of building in public: shipped the mood-based feed. Small reps every day. They compound — keep going.",
  },
};

const TOASTS = [
  { icon: Flame, tint: "text-orange-300 bg-orange-400/10", name: "@maya", action: "reacted to your post" },
  { icon: Users, tint: "text-teal-300 bg-teal-400/10", name: "@arif", action: "joined your space" },
  { icon: MessageCircle, tint: "text-amber-300 bg-amber-400/10", name: "@nabila", action: "commented: “so clean!”" },
];

const TRENDING = [
  { tag: "#kivo", count: "2.1k" },
  { tag: "#design", count: "984" },
  { tag: "#webdev", count: "771" },
];

export function HeroPreview() {
  const reduce = useReducedMotion();
  const [mood, setMood] = useState<Mood>("tech");
  const [toastIndex, setToastIndex] = useState(0);
  const finePointer = useRef(false);

  // 3D tilt springs (desktop fine pointers only)
  const rotateX = useMotionValue(0);
  const rotateY = useMotionValue(0);
  const springX = useSpring(rotateX, { stiffness: 140, damping: 18, mass: 0.6 });
  const springY = useSpring(rotateY, { stiffness: 140, damping: 18, mass: 0.6 });

  useEffect(() => {
    finePointer.current = window.matchMedia("(pointer: fine)").matches;
  }, []);

  useEffect(() => {
    if (reduce) return;
    const iv = setInterval(() => setToastIndex((i) => (i + 1) % TOASTS.length), 4500);
    return () => clearInterval(iv);
  }, [reduce]);

  const onTilt = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!finePointer.current || reduce) return;
    const r = e.currentTarget.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    rotateY.set(px * 7);
    rotateX.set(-py * 5);
  };
  const resetTilt = () => {
    rotateX.set(0);
    rotateY.set(0);
  };

  const m = MOODS[mood];
  const toast = TOASTS[toastIndex];
  const ToastIcon = toast.icon;

  return (
    <div id="kivo-preview" className="relative mx-auto w-full max-w-4xl scroll-mt-28 px-4 sm:px-6">
      {/* Glow pool under the frame */}
      <div
        aria-hidden="true"
        className="absolute inset-x-6 top-16 bottom-6 rounded-[3rem] bg-[radial-gradient(55%_60%_at_50%_25%,rgba(255,107,44,0.16),transparent_70%)] blur-2xl"
      />

      <motion.div
        initial={reduce ? { opacity: 0 } : { opacity: 0, y: 44, scale: 0.965 }}
        whileInView={{ opacity: 1, y: 0, scale: 1 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
        style={{ perspective: 1600 }}
      >
        {/* Idle float (separate layer so tilt transforms never conflict) */}
        <motion.div
          animate={reduce ? undefined : { y: [0, -10, 0] }}
          transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}
        >
          <motion.div
            onMouseMove={onTilt}
            onMouseLeave={resetTilt}
            style={{ rotateX: springX, rotateY: springY }}
            className="relative"
          >
            {/* Cycling realtime toast */}
            <AnimatePresence mode="wait">
              <motion.div
                key={toastIndex}
                initial={reduce ? { opacity: 0 } : { opacity: 0, y: 14, scale: 0.94 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={reduce ? { opacity: 0 } : { opacity: 0, y: -10, scale: 0.96 }}
                transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
                className="absolute -top-5 right-3 z-20 flex max-w-[calc(100%-24px)] items-center gap-2.5 rounded-2xl border border-white/10 bg-[#171310]/90 py-2.5 pl-3 pr-4 shadow-[0_18px_50px_-12px_rgba(0,0,0,0.8)] backdrop-blur-xl sm:-right-5 sm:top-8"
                role="status"
              >
                <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-xl", toast.tint)}>
                  <ToastIcon className="h-4 w-4" />
                </span>
                <span className="relative flex h-2.5 w-2.5 shrink-0" aria-hidden="true">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400/60" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400" />
                </span>
                <p className="truncate text-xs text-stone-300">
                  <span className="font-semibold text-stone-100">{toast.name}</span> {toast.action}
                </p>
              </motion.div>
            </AnimatePresence>

            {/* Floating AI summary badge */}
            <motion.div
              aria-hidden="true"
              className="absolute -bottom-5 left-4 z-20 flex items-center gap-2 rounded-full border border-amber-400/25 bg-[#171310]/90 px-3.5 py-2 shadow-[0_14px_40px_-12px_rgba(0,0,0,0.8)] backdrop-blur-xl sm:-left-6"
              animate={reduce ? undefined : { y: [0, -6, 0] }}
              transition={{ duration: 5.5, repeat: Infinity, ease: "easeInOut", delay: 1.2 }}
            >
              <Sparkles className="h-3.5 w-3.5 text-amber-300" />
              <span className="text-[11px] font-semibold text-stone-200">AI Summary ready</span>
              <span className="relative flex h-1.5 w-1.5" aria-hidden="true">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-300/70" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-amber-300" />
              </span>
            </motion.div>

            {/* Browser frame */}
            <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#0f0d0b]/90 shadow-[0_50px_140px_-24px_rgba(0,0,0,0.85)] backdrop-blur-xl">
              {/* Chrome bar */}
              <div className="flex items-center gap-3 border-b border-white/[0.06] bg-white/[0.02] px-4 py-3">
                <div className="flex gap-1.5" aria-hidden="true">
                  <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]/80" />
                  <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]/80" />
                  <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]/80" />
                </div>
                <div className="mx-auto flex w-full max-w-[240px] items-center justify-center gap-1.5 rounded-full border border-white/[0.07] bg-white/[0.03] px-3 py-1 text-[11px] text-stone-400">
                  <Lock className="h-3 w-3" />
                  kivo.app
                </div>
                <div className="w-10" aria-hidden="true" />
              </div>

              <div className="flex text-left">
                {/* Mini sidebar */}
                <aside
                  aria-hidden="true"
                  className="hidden w-14 shrink-0 flex-col items-center gap-1 border-r border-white/[0.05] py-4 sm:flex"
                >
                  <KivoBrand variant="icon" size={22} />
                  <div className="mt-3 flex flex-col items-center gap-1">
                    {[Home, Compass, Bell, Bookmark, UserIcon].map((Icon, i) => (
                      <span
                        key={i}
                        className={cn(
                          "flex h-8 w-8 items-center justify-center rounded-lg",
                          i === 0 ? "bg-[#ff6b2c]/15 text-[#ff8a3d]" : "text-stone-600",
                        )}
                      >
                        <Icon className="h-4 w-4" />
                      </span>
                    ))}
                  </div>
                  <span className="mt-auto flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-amber-400/70 to-orange-600/70 text-[9px] font-bold text-white">
                    M
                  </span>
                </aside>

                {/* Feed column */}
                <div className="min-w-0 flex-1 space-y-3 p-3.5 sm:p-5">
                  {/* Mood selector */}
                  <div className="flex items-center gap-1.5" role="tablist" aria-label="Feed mood">
                    {(Object.keys(MOODS) as Mood[]).map((key) => {
                      const active = key === mood;
                      return (
                        <button
                          key={key}
                          type="button"
                          role="tab"
                          aria-selected={active}
                          onClick={() => setMood(key)}
                          className={cn(
                            "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[11px] font-semibold outline-none transition-all duration-200 focus-visible:ring-2 focus-visible:ring-[#ff8a3d]/60",
                            active
                              ? MOODS[key].active
                              : "border-white/[0.07] bg-white/[0.02] text-stone-500 hover:border-white/15 hover:text-stone-300",
                          )}
                        >
                          <span className={cn("h-1.5 w-1.5 rounded-full", active ? MOODS[key].dot : "bg-stone-600")} />
                          {MOODS[key].label}
                        </button>
                      );
                    })}
                  </div>

                  {/* Mock post */}
                  <article className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3.5 sm:p-4">
                    <div className="flex items-center gap-2.5">
                      <span
                        className={cn(
                          "flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-[10px] font-bold text-white",
                          m.avatar,
                        )}
                      >
                        {m.initials}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-[13px] font-semibold text-stone-100">{m.name}</p>
                        <p className="text-[11px] text-stone-500">{m.handle} · 5h</p>
                      </div>
                      <span className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-full border border-amber-400/25 bg-amber-400/10 px-2 py-0.5 text-[10px] font-semibold text-amber-200">
                        <Sparkles className="h-3 w-3" />
                        AI
                      </span>
                    </div>
                    <AnimatePresence mode="wait">
                      <motion.div
                        key={mood}
                        initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={reduce ? { opacity: 0 } : { opacity: 0, y: -6 }}
                        transition={{ duration: 0.3, ease: "easeOut" }}
                      >
                        <p className="mt-3 text-[13px] leading-relaxed text-stone-300">{m.text}</p>
                        <p className={cn("mt-2 text-[12px] font-semibold", m.tagColor)}>{m.tag}</p>
                      </motion.div>
                    </AnimatePresence>
                    <div className="mt-3 flex items-center gap-4 border-t border-white/[0.05] pt-2.5 text-[11px] text-stone-500">
                      <span className="inline-flex items-center gap-1">
                        <Flame className="h-3.5 w-3.5 text-orange-400/80" /> 24
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <MessageCircle className="h-3.5 w-3.5" /> 8
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Share2 className="h-3.5 w-3.5" /> Share
                      </span>
                    </div>
                  </article>

                  {/* Faded next post (feed continuity) */}
                  <div aria-hidden="true" className="space-y-2.5 rounded-xl border border-white/[0.05] p-3.5 opacity-45 sm:p-4">
                    <div className="flex items-center gap-2.5">
                      <span className="h-9 w-9 rounded-full bg-gradient-to-br from-stone-600/60 to-stone-800/60" />
                      <div className="space-y-1.5">
                        <div className="h-2 w-24 rounded-full bg-stone-700/60" />
                        <div className="h-2 w-14 rounded-full bg-stone-800/70" />
                      </div>
                    </div>
                    <div className="space-y-1.5 pt-1">
                      <div className="h-2 w-full rounded-full bg-stone-800/70" />
                      <div className="h-2 w-4/5 rounded-full bg-stone-800/70" />
                    </div>
                  </div>
                </div>

                {/* Mini right rail */}
                <aside
                  aria-hidden="true"
                  className="hidden w-44 shrink-0 flex-col gap-4 border-l border-white/[0.05] p-4 lg:flex"
                >
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-stone-500">Trending</p>
                    <div className="mt-2 space-y-2">
                      {TRENDING.map((t) => (
                        <div key={t.tag} className="flex items-center justify-between text-[11px]">
                          <span className="font-semibold text-stone-300">{t.tag}</span>
                          <span className="text-stone-600">{t.count}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="border-t border-white/[0.05] pt-3">
                    <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-stone-500">Suggested</p>
                    <div className="mt-2 space-y-2.5">
                      {[
                        { n: "Nabila A.", g: "from-rose-400/70 to-orange-500/70" },
                        { n: "Arif M.", g: "from-teal-300/70 to-emerald-600/70" },
                      ].map((s) => (
                        <div key={s.n} className="flex items-center gap-2 text-[11px] text-stone-400">
                          <span className={cn("h-6 w-6 rounded-full bg-gradient-to-br", s.g)} />
                          {s.n}
                        </div>
                      ))}
                    </div>
                  </div>
                </aside>
              </div>
            </div>
          </motion.div>
        </motion.div>
      </motion.div>
    </div>
  );
}
