"use client";

import { motion, useReducedMotion } from "framer-motion";
import type { Variants } from "framer-motion";
import { Sparkles } from "lucide-react";
import { KivoBrand } from "@/components/kivo-brand";
import { navigateTo } from "@/lib/router";
import { cn } from "@/lib/utils";
import { LandingNav } from "@/features/auth/components/landing/landing-nav";
import { HeroPreview } from "@/features/auth/components/landing/hero-preview";
import { BentoFeatures } from "@/features/auth/components/landing/bento-features";

/**
 * KIVO landing — a dark, cinematic, code-rendered marketing page (Linear /
 * Apple / Vercel inspired). Continues the splash's "premiere" aesthetic into
 * the product story. Functionality unchanged: Sign in → /login, Get started →
 * /signup, demo button → /login (the login view fills demo credentials).
 */

const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];

// Module-level variant tree — the parent staggers children (same proven
// pattern as the cinematic splash; immune to prop-identity re-render churn).
const HERO_STAGGER: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.09, delayChildren: 0.05 } },
};

const HERO_ITEM: Variants = {
  hidden: { opacity: 0, y: 22 },
  show: { opacity: 1, y: 0, transition: { duration: 0.7, ease: EASE } },
};

function Hero() {
  const reduce = useReducedMotion() ?? false;

  if (reduce) {
    // Static, animation-free hero for reduced motion.
    return (
      <section className="relative overflow-hidden px-4 pb-16 pt-32 text-center sm:px-6 sm:pt-40">
        <HeroBackdrop />
        <div className="relative mx-auto w-full max-w-5xl">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3.5 py-1.5 text-xs font-medium text-stone-300 backdrop-blur-md">
            <Sparkles className="h-3.5 w-3.5 text-[#ff8a3d]" />
            A cleaner kind of social
          </span>
          <h1 className="mx-auto mt-7 max-w-4xl text-balance text-[2.65rem] font-extrabold leading-[1.03] tracking-[-0.03em] text-stone-50 sm:text-6xl lg:text-7xl">
            Social, but{" "}
            <span className="bg-gradient-to-br from-[#ffc07a] via-[#ff8a3d] to-[#ff6b2c] bg-clip-text text-transparent">
              cleaner
            </span>
            .
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-pretty text-base leading-relaxed text-stone-400 sm:text-lg">
            KIVO is a fast, modern space to share moments, join real communities, and keep
            conversations worth having.
          </p>
          <HeroCtas />
          <p className="mt-5 inline-flex items-center gap-2 rounded-full border border-white/[0.07] bg-white/[0.03] px-3.5 py-1.5 font-mono text-[11px] text-stone-500">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400/80" aria-hidden="true" />
            One-tap demo: maya@kivo.app — no password needed
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="relative overflow-hidden px-4 pb-16 pt-32 text-center sm:px-6 sm:pt-40">
      <HeroBackdrop />

      <motion.div
        variants={HERO_STAGGER}
        initial="hidden"
        animate="show"
        className="relative mx-auto w-full max-w-5xl"
      >
        {/* Badge */}
        <motion.div variants={HERO_ITEM} className="flex justify-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3.5 py-1.5 text-xs font-medium text-stone-300 shadow-[0_0_24px_-8px_rgba(255,107,44,0.35)] backdrop-blur-md">
            <motion.span
              aria-hidden="true"
              animate={{ opacity: [1, 0.55, 1], scale: [1, 0.9, 1] }}
              transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
            >
              <Sparkles className="h-3.5 w-3.5 text-[#ff8a3d]" />
            </motion.span>
            A cleaner kind of social
          </span>
        </motion.div>

        {/* Headline */}
        <motion.h1
          variants={HERO_ITEM}
          className="mx-auto mt-7 max-w-4xl text-balance text-[2.65rem] font-extrabold leading-[1.03] tracking-[-0.03em] text-stone-50 sm:text-6xl lg:text-7xl"
        >
          Social, but{" "}
          <span className="bg-gradient-to-br from-[#ffc07a] via-[#ff8a3d] to-[#ff6b2c] bg-clip-text text-transparent">
            cleaner
          </span>
          .
        </motion.h1>

        <motion.p
          variants={HERO_ITEM}
          className="mx-auto mt-5 max-w-xl text-pretty text-base leading-relaxed text-stone-400 sm:text-lg"
        >
          KIVO is a fast, modern space to share moments, join real communities, and keep
          conversations worth having.
        </motion.p>

        <HeroCtas animated />

        {/* Demo credentials pill */}
        <motion.p
          variants={HERO_ITEM}
          className="mt-5 inline-flex items-center gap-2 rounded-full border border-white/[0.07] bg-white/[0.03] px-3.5 py-1.5 font-mono text-[11px] text-stone-500"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400/80" aria-hidden="true" />
          One-tap demo: maya@kivo.app — no password needed
        </motion.p>
      </motion.div>
    </section>
  );
}

function HeroBackdrop() {
  return (
    <>
      {/* Ambient warm glow behind the headline */}
      <div
        aria-hidden="true"
        className="absolute left-1/2 top-[-190px] h-[480px] w-[min(56rem,140vw)] -translate-x-1/2 rounded-[50%] opacity-40 blur-[110px]"
        style={{
          background:
            "radial-gradient(closest-side, rgba(255,107,44,0.42), rgba(255,107,44,0.1) 55%, transparent 75%)",
        }}
      />
      {/* Faint architectural grid, masked toward the horizon */}
      <div
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-[560px]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.035) 1px, transparent 1px)",
          backgroundSize: "72px 72px",
          maskImage: "radial-gradient(ellipse 90% 62% at 50% 0%, black 32%, transparent 78%)",
          WebkitMaskImage: "radial-gradient(ellipse 90% 62% at 50% 0%, black 32%, transparent 78%)",
        }}
      />
    </>
  );
}

function HeroCtas({ animated = false }: { animated?: boolean }) {
  const cls = "inline-flex h-12 w-full items-center justify-center rounded-xl px-8 text-[15px] font-semibold outline-none transition-all duration-200 sm:w-auto";
  const buttons = (
    <>
      <button
        type="button"
        onClick={() => navigateTo("/signup")}
        className={cn(
          cls,
          "bg-[#ff6b2c] text-white shadow-[0_10px_44px_-10px_rgba(255,107,44,0.65)] hover:-translate-y-0.5 hover:bg-[#ff7d42] hover:shadow-[0_14px_54px_-10px_rgba(255,107,44,0.8)] active:translate-y-0 active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-[#ffb36b]/70",
        )}
      >
        Create your account
      </button>
      <button
        type="button"
        onClick={() => navigateTo("/login")}
        className={cn(
          cls,
          "border border-white/10 bg-white/[0.04] text-stone-200 backdrop-blur-md hover:-translate-y-0.5 hover:border-white/20 hover:bg-white/[0.08] active:translate-y-0 active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-[#ff8a3d]/60",
        )}
      >
        Try the demo account
      </button>
    </>
  );

  if (!animated) {
    return <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">{buttons}</div>;
  }
  return (
    <motion.div variants={HERO_ITEM} className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
      {buttons}
    </motion.div>
  );
}

export default function LandingView() {
  return (
    <div className="relative flex min-h-svh flex-col overflow-x-clip bg-[#0b0a09] text-stone-100">
      <LandingNav />
      <main className="flex-1">
        <Hero />
        <HeroPreview />
        <BentoFeatures />
      </main>

      <footer className="mt-auto border-t border-white/[0.06] py-8">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-3 px-4 text-center text-xs text-stone-500 sm:flex-row sm:px-6 sm:text-left">
          <span className="inline-flex items-center gap-2.5">
            <KivoBrand variant="compact" size={20} wordClassName="text-stone-200" />
            <span aria-hidden="true" className="hidden h-3 w-px bg-white/10 sm:block" />
            <span>Social, but cleaner.</span>
          </span>
          <span>© {new Date().getFullYear()} KIVO — Built for people, not algorithms.</span>
        </div>
      </footer>
    </div>
  );
}
