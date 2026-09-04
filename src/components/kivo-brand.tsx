"use client";

import { cn } from "@/lib/utils";

/**
 * KivoBrand — the single source of truth for the official KIVO identity.
 * Uses the provided brand asset AS-IS (public/brand/kivo-mark.png).
 * Do NOT recolor, redraw or substitute this asset anywhere in the app.
 * (Plain <img> is intentional: tiny static asset, zero optimizer overhead.)
 *
 * Variants:
 *  - "full"    → mark + wordmark (sidebar, auth pages)          [default]
 *  - "icon"    → mark only (footer, favicon-like spots)
 *  - "compact" → smaller mark + tighter wordmark (mobile bars)
 *  - "splash"  → large centered lockup with glow (loading screen)
 */
export function KivoBrand({
  variant = "full",
  size,
  className,
  wordClassName,
}: {
  variant?: "full" | "icon" | "compact" | "splash";
  size?: number;
  className?: string;
  wordClassName?: string;
}) {
  const img = (mark: number, decorative: boolean, extra?: string) => (
    <img
      src="/brand/kivo-mark.png"
      alt={decorative ? "" : "KIVO"}
      aria-hidden={decorative || undefined}
      width={mark}
      height={mark}
      draggable={false}
      className={cn("shrink-0 rounded-[22%] shadow-sm", extra)}
    />
  );

  if (variant === "splash") {
    const mark = size ?? 96;
    return (
      <div className={cn("flex flex-col items-center select-none", className)}>
        <div className="relative">
          <div aria-hidden="true" className="splash-glow absolute -inset-10 rounded-full" />
          <div className="animate-rise relative">
            {img(mark, true, "rounded-[22%] shadow-2xl shadow-black/30")}
          </div>
        </div>
        <span
          className="animate-rise mt-6 text-3xl font-extrabold leading-none tracking-tight"
          style={{ animationDelay: "120ms" }}
        >
          KIVO
        </span>
      </div>
    );
  }

  if (variant === "icon") {
    const mark = size ?? 36;
    return (
      <span
        role="img"
        aria-label="KIVO"
        className={cn("inline-flex select-none items-center justify-center", className)}
      >
        {img(mark, true)}
      </span>
    );
  }

  if (variant === "compact") {
    const mark = size ?? 26;
    return (
      <span className={cn("inline-flex items-center gap-2 select-none", className)}>
        {img(mark, false)}
        <span
          className={cn("text-base font-extrabold leading-none tracking-tight", wordClassName)}
        >
          KIVO
        </span>
      </span>
    );
  }

  // "full" — matches the footprint the old wordmark had across the app.
  const mark = size ?? 30;
  return (
    <span className={cn("inline-flex items-center gap-2.5 select-none", className)}>
      {img(mark, false)}
      <span
        className={cn(
          "text-[1.3rem] font-extrabold leading-none tracking-tight",
          wordClassName,
        )}
      >
        KIVO
      </span>
    </span>
  );
}
