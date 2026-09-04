"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  BellRing,
  BrainCircuit,
  Hourglass,
  SlidersHorizontal,
  Sparkles,
  Timer,
} from "lucide-react";
import type { ReactNode } from "react";
import { Reveal } from "./reveal";
import { cn } from "@/lib/utils";
import type { Variants } from "framer-motion";

const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];

// Variant-tree stagger (the only delay mechanism that survives this app's
// re-render churn) — container triggers, children cascade.
const BENTO_STAGGER: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08 } },
};

const BENTO_ITEM: Variants = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.65, ease: EASE } },
};

/**
 * Asymmetric bento grid replacing the old six-equal-cards feature section.
 * Everything inside the cards is code-rendered UI (no image assets):
 * an interactive mood widget, a live 24h countdown ring, realtime ping dots,
 * an AI badge and a minimalist anti-doomscroll stat.
 */

const DAY_SECONDS = 23 * 3600 + 59 * 60 + 59;

function useCountdown() {
  const [left, setLeft] = useState(DAY_SECONDS);
  useEffect(() => {
    const iv = setInterval(() => setLeft((s) => (s <= 1 ? DAY_SECONDS : s - 1)), 1000);
    return () => clearInterval(iv);
  }, []);
  const h = Math.floor(left / 3600);
  const m = Math.floor((left % 3600) / 60);
  const s = left % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return { label: `${pad(h)}:${pad(m)}:${pad(s)}`, frac: left / (24 * 3600) };
}

function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div variants={BENTO_ITEM} className={className}>
      <div className="group relative h-full overflow-hidden rounded-2xl border border-white/10 bg-[#12100d]/90 transition-colors duration-300 hover:border-[#ff6b2c]/30">
        {/* light shimmer on hover */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/[0.05] to-transparent transition-transform duration-1000 ease-out group-hover:translate-x-full"
        />
        {children}
      </div>
    </motion.div>
  );
}

function CardHeader({
  icon,
  title,
  text,
}: {
  icon: ReactNode;
  title: string;
  text: string;
}) {
  return (
    <div>
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl border border-[#ff6b2c]/20 bg-[#ff6b2c]/10 text-[#ff8a3d]">
        {icon}
      </div>
      <h3 className="text-base font-semibold text-stone-100">{title}</h3>
      <p className="mt-1 text-sm leading-relaxed text-stone-400">{text}</p>
    </div>
  );
}

// ─── Mood widget (interactive) ────────────────────────────────────────────────

type W = "tech" | "chill" | "motivate";

const WIDGET: Record<
  W,
  {
    label: string;
    pill: string;
    dot: string;
    rows: { n: string; i: string; g: string; t: string }[];
  }
> = {
  tech: {
    label: "Tech",
    pill: "border-amber-400/30 bg-amber-400/10 text-amber-200",
    dot: "bg-amber-300",
    rows: [
      { n: "Arian", i: "AK", g: "from-amber-400/80 to-orange-600/80", t: "Edge runtime shipped — cold starts down 92%" },
      { n: "Sana", i: "S", g: "from-yellow-300/80 to-amber-600/80", t: "Rate limits now self-heal under load" },
    ],
  },
  chill: {
    label: "Chill",
    pill: "border-teal-300/30 bg-teal-300/10 text-teal-100",
    dot: "bg-teal-300",
    rows: [
      { n: "Lena", i: "L", g: "from-teal-300/80 to-emerald-600/80", t: "Golden hour from the rooftop 🌇" },
      { n: "Kofi", i: "K", g: "from-emerald-300/80 to-teal-600/80", t: "New lo-fi space — zero ads, all vibe" },
    ],
  },
  motivate: {
    label: "Motivation",
    pill: "border-orange-400/30 bg-orange-400/10 text-orange-200",
    dot: "bg-orange-400",
    rows: [
      { n: "Ravi", i: "R", g: "from-orange-400/80 to-rose-600/80", t: "Week 6 of 5am runs. Still going." },
      { n: "Mira", i: "M", g: "from-rose-400/80 to-orange-500/80", t: "Shipped my first open-source CLI today!" },
    ],
  },
};

function MoodWidget() {
  const [w, setW] = useState<W>("tech");
  const reduce = useReducedMotion() ?? false;

  return (
    <div className="mt-5 rounded-xl border border-white/[0.07] bg-black/30 p-3.5">
      <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label="Try the mood feed">
        {(Object.keys(WIDGET) as W[]).map((key) => {
          const active = key === w;
          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setW(key)}
              className={cn(
                "inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold outline-none transition-all duration-200 focus-visible:ring-2 focus-visible:ring-[#ff8a3d]/60",
                active ? WIDGET[key].pill : "border-white/[0.08] bg-white/[0.02] text-stone-500 hover:border-white/15 hover:text-stone-300",
              )}
            >
              <span className={cn("h-1.5 w-1.5 rounded-full", active ? WIDGET[key].dot : "bg-stone-600")} />
              {WIDGET[key].label}
            </button>
          );
        })}
      </div>
      <AnimatePresence mode="wait">
        <motion.div
          key={w}
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, y: -6 }}
          transition={{ duration: 0.28, ease: "easeOut" }}
          className="mt-3 space-y-2.5"
        >
          {WIDGET[w].rows.map((r) => (
            <div key={r.n} className="flex items-center gap-2.5">
              <span
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-[10px] font-bold text-white",
                  r.g,
                )}
              >
                {r.i}
              </span>
              <p className="min-w-0 truncate text-xs text-stone-300">
                <span className="font-semibold text-stone-100">{r.n}</span>{" "}
                <span className="text-stone-400">{r.t}</span>
              </p>
            </div>
          ))}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

// ─── Countdown ring (24h moments) ─────────────────────────────────────────────

function CountdownRing() {
  const { label, frac } = useCountdown();
  const C = 2 * Math.PI * 20;
  return (
    <div className="mt-5 flex items-center gap-4">
      <div className="relative h-14 w-14 shrink-0">
        <svg viewBox="0 0 48 48" className="h-14 w-14 -rotate-90" aria-hidden="true">
          <circle cx="24" cy="24" r="20" stroke="rgba(255,255,255,0.07)" strokeWidth="4" fill="none" />
          <circle
            cx="24"
            cy="24"
            r="20"
            stroke="url(#kivo-count-ring)"
            strokeWidth="4"
            fill="none"
            strokeLinecap="round"
            strokeDasharray={C}
            strokeDashoffset={C * (1 - frac)}
            className="transition-[stroke-dashoffset] duration-1000 ease-linear"
          />
          <defs>
            <linearGradient id="kivo-count-ring" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#ffb36b" />
              <stop offset="1" stopColor="#ff6b2c" />
            </linearGradient>
          </defs>
        </svg>
        <Hourglass className="absolute left-1/2 top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 text-amber-300/90" />
      </div>
      <div>
        <p className="font-mono text-lg font-semibold tabular-nums tracking-tight text-stone-100" aria-live="off">
          {label}
        </p>
        <p className="text-[11px] text-stone-500">until it vanishes — forever</p>
      </div>
    </div>
  );
}

// ─── Section ──────────────────────────────────────────────────────────────────

export function BentoFeatures() {
  const reduce = useReducedMotion() ?? false;

  return (
    <section id="kivo-features" aria-labelledby="kivo-features-title" className="mx-auto w-full max-w-6xl scroll-mt-28 px-4 pb-24 pt-24 sm:px-6 sm:pt-32">
      <Reveal>
        <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#ff8a3d]/90">Why KIVO</p>
        <h2
          id="kivo-features-title"
          className="mt-3 max-w-2xl text-balance text-3xl font-extrabold tracking-[-0.02em] text-stone-50 sm:text-4xl"
        >
          Everything you need. Nothing you don&apos;t.
        </h2>
        <p className="mt-3 max-w-xl text-pretty text-base text-stone-400">
          Thoughtfully built features that keep you close to people — and far from the noise.
        </p>
      </Reveal>

      <motion.div
        variants={BENTO_STAGGER}
        initial={reduce ? "show" : "hidden"}
        whileInView="show"
        viewport={{ once: true, margin: "-40px" }}
        className="mt-10 grid grid-cols-1 gap-4 sm:gap-5 md:grid-cols-3"
      >
        {/* Card 1 — Mood-based feed (featured, 2x2) */}
        <Card className="md:col-span-2 md:row-span-2">
          <div className="flex h-full flex-col p-5 sm:p-7">
            <CardHeader
              icon={<SlidersHorizontal className="h-5 w-5" />}
              title="Mood-based feed"
              text="Tune your timeline to how you feel right now. Tech, chill, motivation — your feed follows your mood, not an engagement curve."
            />
            <div className="mt-auto pt-5">
              <MoodWidget />
            </div>
          </div>
        </Card>

        {/* Card 2 — Moments in 24h (tall) */}
        <Card className="md:row-span-2">
          <div className="flex h-full flex-col p-5 sm:p-6">
            <CardHeader
              icon={<Timer className="h-5 w-5" />}
              title="Moments in 24h"
              text="Ghost posts that vanish — presence without pressure."
            />
            <CountdownRing />
            <div className="mt-auto space-y-2.5 pt-6" aria-hidden="true">
              {[
                { g: "from-rose-400/70 to-orange-500/70", w: "w-32", o: "opacity-100" },
                { g: "from-teal-300/70 to-emerald-600/70", w: "w-24", o: "opacity-60" },
                { g: "from-amber-300/70 to-orange-600/70", w: "w-28", o: "opacity-30" },
              ].map((r, i) => (
                <div key={i} className={cn("flex items-center gap-2.5", r.o)}>
                  <span className={cn("h-8 w-8 shrink-0 rounded-full bg-gradient-to-br", r.g)} />
                  <span className={cn("h-2 rounded-full bg-stone-700/70", r.w)} />
                  <span className="ml-auto shrink-0 font-mono text-[10px] text-stone-600">expiring</span>
                </div>
              ))}
            </div>
          </div>
        </Card>

        {/* Card 3 — Realtime notifications */}
        <Card>
          <div className="flex h-full flex-col p-5 sm:p-6">
            <CardHeader
              icon={<BellRing className="h-5 w-5" />}
              title="Realtime, quietly"
              text="Reactions, replies and follows land instantly — no refresh, no noise."
            />
            <div className="mt-5 space-y-2.5">
              <div className="flex items-center gap-2.5 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2">
                <span className="relative flex h-2 w-2 shrink-0" aria-hidden="true">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400/70" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
                </span>
                <p className="truncate text-[11px] text-stone-400">
                  <span className="font-semibold text-stone-200">@maya</span> reacted to your post
                </p>
              </div>
              <div className="flex items-center gap-2.5 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2 opacity-60">
                <span className="h-2 w-2 shrink-0 rounded-full bg-stone-600" aria-hidden="true" />
                <p className="truncate text-[11px] text-stone-500">
                  <span className="font-semibold text-stone-400">@arif</span> started following you
                </p>
              </div>
            </div>
          </div>
        </Card>

        {/* Card 4 — AI summary & captions */}
        <Card>
          <div className="flex h-full flex-col p-5 sm:p-6">
            <CardHeader
              icon={<BrainCircuit className="h-5 w-5" />}
              title="AI Summary & Captions"
              text="Long threads condensed to the point. Captions written for you — you stay in control."
            />
            <div className="mt-5">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/30 bg-amber-400/10 px-2.5 py-1 text-[11px] font-semibold text-amber-200">
                <Sparkles className="h-3 w-3" />
                Gemini-ready AI
              </span>
              <div className="mt-3 space-y-1.5" aria-hidden="true">
                <div className="h-2 w-full rounded-full bg-gradient-to-r from-stone-700/80 to-stone-800/40" />
                <div className="h-2 w-3/4 rounded-full bg-gradient-to-r from-stone-700/80 to-stone-800/40" />
              </div>
            </div>
          </div>
        </Card>

        {/* Card 5 — Zero doomscrolling */}
        <Card>
          <div className="flex h-full flex-col p-5 sm:p-6">
            <CardHeader
              icon={<Hourglass className="h-5 w-5" />}
              title="Zero doomscrolling"
              text="Chronological by design. When you reach the end, KIVO lets you leave."
            />
            <div className="mt-5 flex items-end gap-3">
              <span className="bg-gradient-to-br from-[#ffb36b] to-[#ff6b2c] bg-clip-text text-5xl font-extrabold leading-none tracking-tight text-transparent">
                0
              </span>
              <div className="pb-0.5">
                <p className="text-xs font-semibold text-stone-200">rabbit holes</p>
                <p className="text-[11px] text-stone-500">100% chronological feed</p>
              </div>
            </div>
          </div>
        </Card>
      </motion.div>
    </section>
  );
}
