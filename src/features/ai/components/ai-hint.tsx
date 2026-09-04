"use client";

import { Sparkles } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/**
 * Tiny decorative brand touch: sparkle + "Made with KIVO AI" tooltip.
 * Drop it inline next to composers, toolbars or AI-powered surfaces.
 */
export function AiHint({ label = "Made with KIVO AI", className }: { label?: string; className?: string }) {
  return (
    <Tooltip>
      <TooltipTrigger
        type="button"
        aria-label={label}
        className={cn(
          "inline-flex h-6 items-center gap-1 rounded-full border border-border/70 bg-card px-2 text-[11px] font-medium text-muted-foreground transition-colors hover:border-brand/40 hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          className,
        )}
      >
        <Sparkles className="h-3 w-3 text-brand" aria-hidden />
        <span>KIVO AI</span>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
