"use client";

import { memo, useState } from "react";
import { BarChart3, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { formatCount } from "@/lib/format";
import { toast } from "sonner";
import type { PollDTO } from "@/types";

/**
 * Interactive poll. Before voting: clickable options. After voting (or when
 * the poll has ended): percentage bars with the viewer's pick in brand color.
 */
export const PollCard = memo(function PollCard({
  poll,
  onVoted,
}: {
  poll: PollDTO;
  onVoted?: (poll: PollDTO) => void;
}) {
  const [busyOption, setBusyOption] = useState<string | null>(null);
  const viewerVoted = poll.options.some((o) => o.votedByViewer);
  const ended = poll.endsAt !== null && new Date(poll.endsAt).getTime() <= Date.now();
  const showResults = viewerVoted || ended;

  async function vote(optionId: string) {
    if (busyOption) return;
    setBusyOption(optionId);
    try {
      const res = await api<{ poll: PollDTO }>(`/api/posts/${poll.id}/vote`, {
        method: "POST",
        body: { optionId },
      });
      onVoted?.(res.poll);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Your vote couldn't be counted. Try again.");
    } finally {
      setBusyOption(null);
    }
  }

  return (
    <div className="mt-3 rounded-xl border bg-muted/40 p-3 sm:p-4" role="group" aria-label="Poll">
      <div className="space-y-2">
        {poll.options.map((option) => {
          const pct =
            poll.totalVotes > 0
              ? Math.round((option.voteCount / poll.totalVotes) * 100)
              : 0;
          if (!showResults) {
            return (
              <Button
                key={option.id}
                type="button"
                variant="outline"
                disabled={busyOption !== null}
                onClick={() => vote(option.id)}
                aria-label={`Vote for ${option.text}`}
                className={cn(
                  "h-10 w-full justify-start rounded-lg border-border/80 bg-card text-sm font-medium transition-colors hover:border-brand/60 hover:text-brand",
                  busyOption === option.id && "opacity-60",
                )}
              >
                {option.text}
              </Button>
            );
          }
          return (
            <div
              key={option.id}
              className={cn(
                "relative h-10 overflow-hidden rounded-lg border text-sm transition-colors",
                option.votedByViewer ? "border-brand/50" : "border-border/70",
              )}
              aria-label={`${option.text}: ${pct}%`}
            >
              <div
                className={cn(
                  "absolute inset-y-0 left-0 transition-[width] duration-300 ease-out",
                  option.votedByViewer ? "bg-brand/25" : "bg-foreground/10",
                )}
                style={{ width: `${pct}%` }}
                aria-hidden="true"
              />
              <div className="relative flex h-full items-center justify-between px-3">
                <span className="flex min-w-0 items-center gap-1.5 font-medium">
                  {option.votedByViewer && (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-brand" aria-hidden="true" />
                  )}
                  <span className="truncate">{option.text}</span>
                </span>
                <span className={cn("ml-2 shrink-0 tabular-nums", option.votedByViewer ? "font-semibold text-brand" : "text-muted-foreground")}>
                  {pct}%
                </span>
              </div>
            </div>
          );
        })}
      </div>
      <p className="mt-2 flex items-center gap-1.5 px-0.5 text-xs text-muted-foreground">
        <BarChart3 className="h-3.5 w-3.5" aria-hidden="true" />
        {formatCount(poll.totalVotes)} {poll.totalVotes === 1 ? "vote" : "votes"}
        {ended ? " · Final results" : viewerVoted ? "" : " · Vote to see results"}
      </p>
    </div>
  );
});
