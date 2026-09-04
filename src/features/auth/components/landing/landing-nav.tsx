"use client";

import { useEffect, useState } from "react";
import { KivoBrand } from "@/components/kivo-brand";
import { navigateTo } from "@/lib/router";
import { cn } from "@/lib/utils";

const LINKS = [
  { label: "Preview", target: "kivo-preview" },
  { label: "Features", target: "kivo-features" },
];

/**
 * Floating glassmorphic navbar. Sits as a centered capsule over the hero and
 * condenses (height + frosted surface + border) once the page scrolls.
 * In-page links use scrollIntoView — never hash anchors (the app uses hash
 * routing, so `#...` hrefs would be interpreted as routes).
 */
export function LandingNav() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const jump = (id: string) =>
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center px-3 pt-3 sm:px-4 sm:pt-4">
      <nav
        aria-label="Primary"
        className={cn(
          "pointer-events-auto flex w-full max-w-5xl items-center justify-between gap-2 rounded-2xl border px-3 transition-all duration-300 sm:px-4",
          scrolled
            ? "h-14 border-white/10 bg-[#0b0a09]/75 shadow-[0_16px_48px_-16px_rgba(0,0,0,0.75)] backdrop-blur-xl"
            : "h-16 border-transparent bg-transparent",
        )}
      >
        <button
          type="button"
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          aria-label="KIVO home"
          className="rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-[#ff8a3d]/60"
        >
          <KivoBrand wordClassName="text-stone-50" />
        </button>

        <div className="hidden items-center gap-1 md:flex">
          {LINKS.map((l) => (
            <button
              key={l.target}
              type="button"
              onClick={() => jump(l.target)}
              className="h-10 rounded-lg px-3.5 text-sm font-medium text-stone-400 outline-none transition-colors hover:bg-white/[0.05] hover:text-stone-100 focus-visible:ring-2 focus-visible:ring-[#ff8a3d]/60"
            >
              {l.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => navigateTo("/login")}
            className="hidden h-11 items-center rounded-xl px-4 text-sm font-semibold text-stone-300 outline-none transition-colors hover:bg-white/[0.06] hover:text-stone-50 focus-visible:ring-2 focus-visible:ring-[#ff8a3d]/60 min-[400px]:inline-flex"
          >
            Sign in
          </button>
          <button
            type="button"
            onClick={() => navigateTo("/signup")}
            className="inline-flex h-11 items-center rounded-xl bg-[#ff6b2c] px-4 text-sm font-semibold text-white shadow-[0_6px_28px_-8px_rgba(255,107,44,0.65)] outline-none transition-all duration-200 hover:bg-[#ff7d42] hover:shadow-[0_8px_36px_-8px_rgba(255,107,44,0.8)] active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-[#ffb36b]/70"
          >
            Get started
          </button>
        </div>
      </nav>
    </div>
  );
}
