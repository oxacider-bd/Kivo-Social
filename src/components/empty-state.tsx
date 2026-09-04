"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Shared empty/error states. Lucide icons passed via `icon` are normalized to
 * a consistent size, weight and brand-tinted treatment.
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-1.5 rounded-2xl border border-dashed px-6 py-14 text-center",
        className,
      )}
    >
      {icon && (
        <div
          aria-hidden="true"
          className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-soft text-brand [&_svg:not([class*='h-']):not([class*='w-'])]:h-6 [&_svg]:shrink-0"
        >
          {icon}
        </div>
      )}
      <p className="text-[15px] font-semibold tracking-[-0.01em]">{title}</p>
      {description && (
        <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({
  title = "Something went wrong",
  description = "Please try again in a moment.",
  action,
  className,
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-2 rounded-2xl border px-6 py-14 text-center",
        className,
      )}
    >
      <p className="text-[15px] font-semibold tracking-[-0.01em]">{title}</p>
      <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">{description}</p>
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
