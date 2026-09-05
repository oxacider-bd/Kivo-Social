"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { KivoBrand } from "@/components/kivo-brand";
import { ThemeToggle } from "@/components/theme-toggle";
import { CheckCircle2 } from "lucide-react";

const POINTS = [
  { title: "Feed that feels calm", text: "Chronological, clean, and yours — no noisy algorithms." },
  { title: "Spaces for your people", text: "Interest-based communities with their own rules and rhythm." },
  { title: "Moments in 24h", text: "Share the now — photos, polls and quick takes that fade." },
  { title: "Threads that make sense", text: "Nested conversations that stay easy to follow." },
];

export function AuthLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-svh flex-col">
      <div className="flex flex-1">
        {/* Brand panel */}
        <aside className="relative hidden w-[46%] max-w-[560px] flex-col justify-between overflow-hidden p-10 lg:flex">
          <div className="brand-gradient absolute inset-0 opacity-[0.07]" aria-hidden="true" />
          <Link href="#/" className="relative w-fit rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="KIVO home">
            <KivoBrand />
          </Link>

          <div className="relative">
            <h1 className="max-w-md text-4xl font-extrabold leading-[1.1] tracking-tight">
              Social, but <span className="brand-gradient-text">cleaner</span>.
            </h1>
            <p className="mt-3 max-w-sm text-[15px] text-muted-foreground">
              KIVO is a fast, modern space to share what matters — without the clutter.
            </p>
            <ul className="mt-8 space-y-4">
              {POINTS.map((p) => (
                <li key={p.title} className="flex gap-3">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-brand" aria-hidden="true" />
                  <div>
                    <p className="text-sm font-semibold">{p.title}</p>
                    <p className="text-sm text-muted-foreground">{p.text}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <p className="relative text-xs text-muted-foreground">
            © {new Date().getFullYear()} KIVO. Built for people, not algorithms.
          </p>
        </aside>

        {/* Form panel */}
        <main className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center justify-between px-5 pb-4 pt-[max(1.25rem,env(safe-area-inset-top))] lg:justify-end lg:pt-5">
            <Link href="#/" className="lg:hidden" aria-label="KIVO home">
              <KivoBrand variant="compact" />
            </Link>
            <ThemeToggle />
          </div>
          {/* my-auto centers the form when there is room and collapses to
              top-aligned when the form is taller than the viewport — the
              heading can never clip under the top bar on small screens. */}
          <div className="flex min-h-0 flex-1 flex-col px-5 pb-10 pt-5 sm:px-10">
            <div className="mx-auto my-auto w-full max-w-[400px] min-w-0">{children}</div>
          </div>
          <footer className="mt-auto px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] text-center text-xs text-muted-foreground sm:px-10">
            <span>KIVO — Social, but cleaner.</span>
          </footer>
        </main>
      </div>
    </div>
  );
}
