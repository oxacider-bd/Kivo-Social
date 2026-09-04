"use client";

import { useState, useTransition } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { UserPlus, Check, Clock } from "lucide-react";
import { toast } from "sonner";

export type FollowStatus = "none" | "following" | "requested";

interface FollowButtonProps {
  username: string;
  initialStatus?: FollowStatus;
  /** Compact = small pill for cards/lists; default = full-width friendly. */
  size?: "sm" | "md";
  onChange?: (status: FollowStatus) => void;
  className?: string;
}

/**
 * Shared follow/unfollow/request button.
 * Handles public profiles (instant follow) and private profiles (request).
 * Optimistic UI with rollback on error.
 */
export function FollowButton({
  username,
  initialStatus = "none",
  size = "md",
  onChange,
  className,
}: FollowButtonProps) {
  const [status, setStatus] = useState<FollowStatus>(initialStatus);
  const [prev, setPrev] = useState<FollowStatus>(initialStatus);
  const [loading, setLoading] = useState(false);
  const queryClient = useQueryClient();

  async function toggle() {
    if (loading) return;
    const next: FollowStatus =
      status === "none"
        ? "following" // optimistic; server may downgrade to "requested"
        : "none";
    setPrev(status);
    setStatus(next);
    setLoading(true);
    try {
      if (next === "following") {
        const res = await api<{ status: "following" | "requested" }>("/api/follows", {
          body: { username },
        });
        setStatus(res.status);
        if (res.status === "requested") toast(`Follow request sent to @${username}`);
      } else {
        await api("/api/follows", { method: "DELETE", body: { username } });
      }
      onChange?.(status === "none" ? next : "none");
      void queryClient.invalidateQueries({ queryKey: ["profile"] });
      void queryClient.invalidateQueries({ queryKey: ["explore"] });
      void queryClient.invalidateQueries({ queryKey: ["suggested-users"] });
    } catch (err) {
      setStatus(prev);
      toast.error(err instanceof Error ? err.message : "Could not update follow. Try again.");
    } finally {
      setLoading(false);
    }
  }

  const base =
    size === "sm"
      ? "h-8 rounded-full px-3 text-[13px]"
      : "h-9 rounded-full px-4 text-sm";

  if (status === "following") {
    return (
      <Button
        variant="secondary"
        size="sm"
        className={cn(base, "font-semibold", className)}
        onClick={toggle}
        disabled={loading}
        aria-label={`Unfollow @${username}`}
      >
        <Check className="h-4 w-4" /> Following
      </Button>
    );
  }
  if (status === "requested") {
    return (
      <Button
        variant="secondary"
        size="sm"
        className={cn(base, "font-medium text-muted-foreground", className)}
        onClick={toggle}
        disabled={loading}
        aria-label={`Cancel follow request to @${username}`}
      >
        <Clock className="h-4 w-4" /> Requested
      </Button>
    );
  }
  return (
    <Button
      size="sm"
      className={cn(base, "font-semibold", className)}
      onClick={toggle}
      disabled={loading}
      aria-label={`Follow @${username}`}
    >
      <UserPlus className="h-4 w-4" /> Follow
    </Button>
  );
}
