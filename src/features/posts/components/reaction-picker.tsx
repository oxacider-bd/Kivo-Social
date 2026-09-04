"use client";

import { memo, useState, type ReactNode } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { REACTIONS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { ReactionType } from "@/types";

/**
 * KIVO reaction picker — a compact floating pill with the 6 reaction emojis.
 * Click to open (keyboard accessible: every emoji is a focusable button),
 * hover scales each emoji. Used for posts and (mini variant) comments.
 */
export const ReactionPicker = memo(function ReactionPicker({
  onSelect,
  children,
  align = "center",
  side = "top",
  mini = false,
  label = "React",
}: {
  onSelect: (type: ReactionType) => void;
  children: ReactNode;
  align?: "start" | "center" | "end";
  side?: "top" | "bottom";
  mini?: boolean;
  label?: string;
}) {
  const [open, setOpen] = useState(false);

  function pick(type: ReactionType) {
    setOpen(false);
    onSelect(type);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        align={align}
        side={side}
        sideOffset={8}
        className="w-auto rounded-full border-border/70 bg-popover px-1.5 py-1 card-shadow"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div role="group" aria-label="Pick a reaction" className="flex items-center gap-0.5">
          {REACTIONS.map((r) => (
            <Tooltip key={r.type}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label={`${r.label} reaction`}
                  title={r.label}
                  onClick={() => pick(r.type)}
                  className={cn(
                    "rounded-full outline-none transition-transform duration-150 hover:scale-125 hover:bg-accent focus-visible:scale-125 focus-visible:bg-accent focus-visible:ring-2 focus-visible:ring-ring active:scale-110",
                    mini ? "flex h-8 w-8 items-center justify-center text-lg" : "flex h-9 w-9 items-center justify-center text-xl",
                  )}
                >
                  <span aria-hidden="true">{r.emoji}</span>
                </button>
              </TooltipTrigger>
              <TooltipContent className="text-[11px]">{r.label}</TooltipContent>
            </Tooltip>
          ))}
        </div>
        <span className="sr-only">{label}</span>
      </PopoverContent>
    </Popover>
  );
});
