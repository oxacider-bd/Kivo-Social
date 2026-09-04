"use client";

import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { motion, useReducedMotion } from "framer-motion";

/**
 * CinematicSplash — KIVO's boot experience ("First Light").
 *
 * A dark theatrical stage where a single ember spark ignites the KIVO mark:
 * spark → shockwave rings → mark materializes → specular shine sweep →
 * wordmark letters converge from a wide tracking → tagline → ember loader.
 * A canvas-driven ember particle field (sprite-based, DPR-aware, paused when
 * the tab is hidden) and film grain / vignette layers carry the cinema feel.
 *
 * Lifecycle (owned by this component):
 *   1. intro  — the choreographed timeline always plays out (min INTRO_MS),
 *               doubling as the auth-resolution gate (indeterminate loader).
 *   2. exit   — once BOTH the intro finished AND `resolved` is true, the
 *               curtain lifts (dolly zoom + fade) and `onExitStart` fires so
 *               the app beneath can crossfade in lockstep.
 *   3. done   — `onFinish` fires; the parent unmounts the overlay.
 *
 * The brand asset (public/brand/kivo-mark.png) is used AS-IS — never recolored
 * or redrawn — per the identity rule in kivo-brand.tsx.
 */

const INTRO_MS = 2000;
const EXIT_MS = 720;

const EASE_OUT: [number, number, number, number] = [0.16, 1, 0.3, 1];
const EASE_IN_OUT: [number, number, number, number] = [0.45, 0, 0.2, 1];

const MARK_SIZE = 104;

const STAGE_STYLE: CSSProperties = {
  background: [
    "radial-gradient(120% 90% at 50% 36%, rgba(255,138,61,0.09) 0%, rgba(255,138,61,0) 52%)",
    "radial-gradient(95% 75% at 50% 44%, #1a1512 0%, #0c0a09 58%, #070606 100%)",
  ].join(", "),
};

const VIGNETTE_STYLE: CSSProperties = {
  background:
    "radial-gradient(115% 85% at 50% 42%, rgba(0,0,0,0) 52%, rgba(0,0,0,0.52) 100%)",
};

const GRAIN_STYLE: CSSProperties = {
  backgroundImage:
    "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.55'/%3E%3C/svg%3E\")",
  backgroundSize: "180px 180px",
};

// ─── Ember particle field ─────────────────────────────────────────────────────

function makeEmberSprite(hue: number): HTMLCanvasElement {
  const s = 64;
  const c = document.createElement("canvas");
  c.width = s;
  c.height = s;
  const g = c.getContext("2d");
  if (!g) return c;
  const grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  grad.addColorStop(0, `hsla(${hue}, 96%, 70%, 1)`);
  grad.addColorStop(0.35, `hsla(${hue}, 92%, 58%, 0.55)`);
  grad.addColorStop(1, `hsla(${hue}, 90%, 50%, 0)`);
  g.fillStyle = grad;
  g.fillRect(0, 0, s, s);
  return c;
}

interface Ember {
  x: number;
  y: number;
  r: number;
  vy: number;
  vx: number;
  tw: number;
  twSpeed: number;
  alpha: number;
  sprite: number;
}

function EmberField() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Three warm tints (amber → ember) pre-rendered once — per-frame work is
    // then just cheap drawImage calls, not gradient allocations.
    const sprites = [32, 40, 48].map(makeEmberSprite);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let w = 0;
    let h = 0;
    let parts: Ember[] = [];

    const spawn = (initial: boolean): Ember => ({
      x: Math.random() * w,
      y: initial ? Math.random() * h : h + 12,
      r: 0.6 + Math.random() * 1.9,
      vy: 0.14 + Math.random() * 0.4,
      vx: (Math.random() - 0.5) * 0.14,
      tw: Math.random() * Math.PI * 2,
      twSpeed: 0.012 + Math.random() * 0.026,
      alpha: 0.22 + Math.random() * 0.5,
      sprite: Math.floor(Math.random() * sprites.length),
    });

    const resize = () => {
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.round(Math.min(64, Math.max(14, (w * h) / 26000)));
      parts = Array.from({ length: count }, () => spawn(true));
    };
    resize();
    window.addEventListener("resize", resize);

    let raf = 0;
    let running = true;
    let last = performance.now();

    const tick = (now: number) => {
      if (!running) return;
      raf = requestAnimationFrame(tick);
      const dt = Math.min(50, now - last) / 16.667; // normalize to 60fps steps
      last = now;

      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = "lighter";

      for (const p of parts) {
        p.y -= p.vy * dt;
        p.x += p.vx * dt + Math.sin(now * 0.0006 + p.tw) * 0.07 * dt;
        p.tw += p.twSpeed * dt;
        if (p.y < -14 || p.x < -20 || p.x > w + 20) Object.assign(p, spawn(false));

        const twinkle = 0.55 + 0.45 * Math.sin(p.tw * 2.1);
        const size = p.r * 8;
        ctx.globalAlpha = p.alpha * twinkle;
        ctx.drawImage(sprites[p.sprite], p.x - size / 2, p.y - size / 2, size, size);
      }
      ctx.globalAlpha = 1;
    };
    raf = requestAnimationFrame(tick);

    const onVisibility = () => {
      if (document.hidden) {
        running = false;
        cancelAnimationFrame(raf);
      } else if (!running) {
        running = true;
        last = performance.now();
        raf = requestAnimationFrame(tick);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return (
    <motion.div
      aria-hidden="true"
      className="absolute inset-0"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 1.2, delay: 0.1, ease: "easeOut" }}
    >
      <canvas ref={canvasRef} className="h-full w-full" />
    </motion.div>
  );
}

// ─── The splash ───────────────────────────────────────────────────────────────

export function CinematicSplash({
  resolved,
  onExitStart,
  onFinish,
}: {
  /** True once the session/auth state has resolved beneath the overlay. */
  resolved: boolean;
  /** Fires the moment the curtain-lift exit begins (parent crossfades the app). */
  onExitStart?: () => void;
  /** Fires when the exit animation has fully played — parent unmounts us. */
  onFinish: () => void;
}) {
  const reduce = useReducedMotion() ?? false;
  const [introDone, setIntroDone] = useState(false);

  // 1) The intro always plays out — even when the session resolves instantly.
  //    (Timer-callback setState, never synchronous in the effect body.)
  useEffect(() => {
    const t = setTimeout(() => setIntroDone(true), reduce ? 400 : INTRO_MS);
    return () => clearTimeout(t);
  }, [reduce]);

  // 2) The curtain lifts only when BOTH the intro finished AND the session
  //    resolved — derived, so no imperative phase transitions are needed.
  const exiting = introDone && resolved;

  // 3) Exit choreography → hand off to the parent.
  useEffect(() => {
    if (!exiting) return;
    onExitStart?.();
    const t = setTimeout(() => onFinish(), reduce ? 320 : EXIT_MS + 90);
    return () => clearTimeout(t);
  }, [exiting, reduce, onExitStart, onFinish]);

  return (
    <motion.div
      role="status"
      aria-label="Loading KIVO"
      className="fixed inset-0 z-[100] overflow-hidden select-none"
      style={STAGE_STYLE}
      initial={{ opacity: 0 }}
      animate={exiting ? "exit" : "intro"}
      variants={{
        intro: { opacity: 1, scale: 1 },
        exit: { opacity: 0, scale: 1.055 },
      }}
      transition={
        exiting
          ? { duration: reduce ? 0.3 : EXIT_MS / 1000, delay: 0.05, ease: EASE_IN_OUT }
          : { duration: 0.4, ease: "easeOut" }
      }
    >
      {/* Ember field (motion-safe only) */}
      {!reduce && <EmberField />}

      {/* Warm pool of light beneath the lockup — a stage floor for the mark */}
      <motion.div
        aria-hidden="true"
        className="absolute top-[66%] left-1/2 h-44 w-[min(46rem,120vw)] max-w-[92vw] -translate-x-1/2 rounded-[100%] blur-3xl"
        style={{
          background:
            "radial-gradient(50% 50% at 50% 50%, rgba(255,130,50,0.14), transparent 72%)",
        }}
        initial={{ opacity: 0 }}
        animate={{ opacity: exiting ? 0 : 0.9 }}
        transition={{ duration: exiting ? 0.5 : 1.1, delay: exiting ? 0 : 0.65, ease: "easeOut" }}
      />

      {/* Center stage */}
      <motion.div
        className="absolute inset-0 flex flex-col items-center justify-center px-6"
        animate={exiting && !reduce ? { scale: 1.06, y: -8 } : { scale: 1, y: 0 }}
        transition={{ duration: reduce ? 0.3 : EXIT_MS / 1000, ease: EASE_IN_OUT }}
      >
        <div className="relative">
          {/* Halo bloom behind the mark (reuses the brand glow utility) */}
          <motion.div
            aria-hidden="true"
            className="splash-glow absolute -inset-14 rounded-full"
            initial={{ opacity: 0 }}
            animate={{ opacity: exiting ? 0 : 0.85 }}
            transition={{ duration: exiting ? 0.4 : 0.9, delay: exiting ? 0 : 0.5, ease: "easeOut" }}
          />

          {/* Shockwave rings at ignition */}
          {!reduce &&
            [0, 1].map((i) => (
              <motion.div
                key={i}
                aria-hidden="true"
                className="absolute inset-0 rounded-full"
                style={{
                  border: "1px solid color-mix(in oklch, var(--brand) 55%, transparent)",
                }}
                initial={{ opacity: 0, scale: 0.55 }}
                animate={{ opacity: [0, 0.8, 0], scale: [0.55, 2.2 + i * 0.8] }}
                transition={{
                  duration: 1.15 + i * 0.25,
                  delay: 0.5 + i * 0.14,
                  times: [0, 0.25, 1],
                  ease: EASE_OUT,
                }}
              />
            ))}

          {/* Ignition spark — burns out exactly as the mark materializes */}
          {!reduce && (
            <motion.div
              aria-hidden="true"
              className="absolute top-1/2 left-1/2 h-2 w-2 rounded-full"
              style={{
                background:
                  "radial-gradient(circle, rgba(255,196,128,0.95), rgba(255,120,40,0.4) 60%, transparent)",
                boxShadow: "0 0 18px 6px rgba(255,140,60,0.45)",
              }}
              initial={{ opacity: 0, x: "-50%", y: "-50%", scale: 0.4 }}
              animate={{ opacity: [0, 1, 1, 0], x: "-50%", y: "-50%", scale: [0.4, 1.1, 1.25, 3.2] }}
              transition={{ duration: 0.9, delay: 0.14, times: [0, 0.3, 0.55, 1], ease: "easeOut" }}
            />
          )}

          {/* The mark — the one and only official brand asset */}
          <motion.div
            className="relative"
            initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.55, y: 14, filter: "blur(16px)" }}
            animate={reduce ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0, filter: "blur(0px)" }}
            transition={
              reduce
                ? { duration: 0.35 }
                : { type: "spring", stiffness: 130, damping: 17, mass: 0.9, delay: 0.5 }
            }
          >
            <div className="relative" style={{ width: MARK_SIZE, height: MARK_SIZE }}>
              <img
                src="/brand/kivo-mark.png"
                alt=""
                aria-hidden="true"
                draggable={false}
                width={MARK_SIZE}
                height={MARK_SIZE}
                className="h-full w-full rounded-[22%] shadow-2xl shadow-black/50"
              />
              {/* Specular shine sweep, clipped to the mark's silhouette */}
              {!reduce && (
                <div
                  aria-hidden="true"
                  className="absolute inset-0 overflow-hidden rounded-[22%]"
                >
                  <motion.div
                    className="absolute inset-y-0 w-1/2 -skew-x-12"
                    style={{
                      background:
                        "linear-gradient(100deg, rgba(255,255,255,0) 0%, rgba(255,244,224,0.5) 45%, rgba(255,255,255,0) 100%)",
                    }}
                    initial={{ x: "-170%" }}
                    animate={{ x: "370%" }}
                    transition={{ duration: 0.85, delay: 1.02, ease: EASE_IN_OUT }}
                  />
                </div>
              )}
            </div>
          </motion.div>
        </div>

        {/* Wordmark — letters rise while tracking converges to the app's look */}
        <motion.div
          aria-hidden="true"
          className="mt-7 flex items-baseline"
          initial={reduce ? undefined : { letterSpacing: "0.34em" }}
          animate={{ letterSpacing: "0.02em" }}
          transition={reduce ? { duration: 0 } : { duration: 1.15, delay: 1.0, ease: EASE_OUT }}
        >
          <span className="sr-only">KIVO</span>
          {"KIVO".split("").map((ch, i) => (
            <motion.span
              key={i}
              className="text-[2.35rem] font-extrabold leading-none text-stone-100 sm:text-[2.75rem]"
              style={{ textShadow: "0 0 28px rgba(255,150,70,0.22)" }}
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: 18, filter: "blur(8px)" }}
              animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0, filter: "blur(0px)" }}
              transition={
                reduce
                  ? { duration: 0.3, delay: 0.1 + i * 0.05 }
                  : { duration: 0.55, delay: 1.02 + i * 0.07, ease: EASE_OUT }
              }
            >
              {ch}
            </motion.span>
          ))}
        </motion.div>

        {/* Tagline */}
        <motion.p
          aria-hidden="true"
          className="mt-3 text-sm font-medium text-stone-400"
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: 10, filter: "blur(6px)" }}
          animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={reduce ? { duration: 0.3, delay: 0.2 } : { duration: 0.55, delay: 1.42, ease: EASE_OUT }}
        >
          Social, but cleaner.
        </motion.p>

        {/* Indeterminate ember loader — doubles as the auth-gate progress */}
        <motion.div
          aria-hidden="true"
          className="splash-bar mt-10 h-[3px] w-36 overflow-hidden rounded-full bg-white/10"
          initial={{ opacity: 0 }}
          animate={{ opacity: exiting ? 0 : 1 }}
          transition={{ duration: 0.5, delay: exiting ? 0 : reduce ? 0.25 : 1.55 }}
        />
      </motion.div>

      {/* Film grain + vignette finish */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.05] mix-blend-overlay"
        style={GRAIN_STYLE}
      />
      <div aria-hidden="true" className="pointer-events-none absolute inset-0" style={VIGNETTE_STYLE} />
    </motion.div>
  );
}
