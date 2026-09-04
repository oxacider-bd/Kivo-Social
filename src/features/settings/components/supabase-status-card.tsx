"use client";

import { useCallback, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Database, Loader2, RefreshCw } from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { pingSupabase, type SupabasePing } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type SupabaseHealth = {
  configured: boolean;
  projectRef: string;
  host: string;
  keyScope: "publishable";
  ping: SupabasePing;
};

type LinkState = { ok: boolean; latencyMs?: number; detail?: string } | null;

function StatusDot({ state }: { state: "ok" | "fail" | "loading" }) {
  if (state === "loading") {
    return <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" aria-hidden="true" />;
  }
  return (
    <span
      aria-hidden="true"
      className={cn(
        "h-2.5 w-2.5 shrink-0 rounded-full",
        state === "ok"
          ? "bg-emerald-500 shadow-[0_0_8px] shadow-emerald-500/40"
          : "bg-destructive shadow-[0_0_8px] shadow-destructive/40"
      )}
    />
  );
}

function linkLabel(state: LinkState) {
  if (!state) return "Checking…";
  return state.ok ? "Connected" : "Unreachable";
}

function linkHint(state: LinkState) {
  if (!state) return "Pinging the Supabase project…";
  if (state.ok) return `${state.latencyMs} ms round-trip`;
  return state.detail ?? "No response from Supabase.";
}

/**
 * Read-only status card for the Supabase backend link.
 * Shows the configured project, and probes connectivity from both
 * the server (API route) and the browser (direct ping) so config
 * issues are easy to localize. No credentials are displayed.
 */
export function SupabaseStatusCard() {
  const health = useQuery({
    queryKey: ["supabase-health"],
    queryFn: () => api<SupabaseHealth>("/api/supabase/health"),
    refetchOnWindowFocus: false,
    staleTime: 30_000,
    retry: 1,
  });

  const [browserPing, setBrowserPing] = useState<LinkState>(null);
  const [browserBusy, setBrowserBusy] = useState(false);

  const checkBrowser = useCallback(async () => {
    setBrowserBusy(true);
    setBrowserPing(null);
    try {
      setBrowserPing(await pingSupabase());
    } catch (err) {
      setBrowserPing({
        ok: false,
        latencyMs: 0,
        detail: err instanceof Error ? err.message : "Not configured",
      });
    } finally {
      setBrowserBusy(false);
    }
  }, []);

  useEffect(() => {
    void checkBrowser();
  }, [checkBrowser]);

  const busy = health.isFetching || browserBusy;
  const recheck = useCallback(async () => {
    await Promise.allSettled([health.refetch(), checkBrowser()]);
  }, [health, checkBrowser]);

  const configured = !health.isError;
  const serverPing = health.data?.ping ?? null;

  return (
    <Card className="gap-0 rounded-2xl py-0 card-shadow" aria-live="polite">
      <CardHeader className="flex-row items-start gap-3 space-y-0 p-5 pb-0">
        <span
          className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand"
          aria-hidden="true"
        >
          <Database className="h-4.5 w-4.5" />
        </span>
        <div className="min-w-0 flex-1">
          <CardTitle className="text-sm font-semibold">Backend connection</CardTitle>
          <CardDescription className="mt-0.5 text-[13px]">
            Live link between KIVO and your Supabase project.
          </CardDescription>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-9 shrink-0 gap-1.5 rounded-full px-3 text-[13px] text-muted-foreground"
          onClick={() => void recheck()}
          disabled={busy}
        >
          <RefreshCw className={cn("h-3.5 w-3.5", busy && "animate-spin")} aria-hidden="true" />
          Check again
        </Button>
      </CardHeader>

      <CardContent className="px-5 pb-5 pt-4 sm:pl-[4.25rem]">
        <div className="flex flex-col divide-y">
          {/* Project */}
          <div className="flex min-h-14 items-center justify-between gap-4 py-2.5 first:pt-0">
            <div className="min-w-0">
              <p className="text-[15px]">Project</p>
              <p className="mt-0.5 truncate text-[13px] text-muted-foreground">
                {health.data?.host ?? "supabase.co"}
              </p>
            </div>
            <span className="shrink-0 rounded-full border bg-muted/50 px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Publishable key
            </span>
          </div>

          {/* Server → Supabase */}
          <div className="flex min-h-14 items-center justify-between gap-4 py-2.5">
            <div className="min-w-0">
              <p className="text-[15px]">Server link</p>
              <p
                className={cn(
                  "mt-0.5 truncate text-[13px]",
                  serverPing && !serverPing.ok && !health.isFetching
                    ? "text-destructive"
                    : "text-muted-foreground"
                )}
              >
                {health.isFetching
                  ? "Pinging the Supabase project…"
                  : health.isError
                    ? "Add the env vars in .env and restart the server."
                    : linkHint(serverPing)}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className="text-[13px] font-medium">
                {health.isError ? "Not configured" : linkLabel(serverPing)}
              </span>
              <StatusDot
                state={
                  health.isError
                    ? "fail"
                    : health.isFetching
                      ? "loading"
                      : serverPing?.ok
                        ? "ok"
                        : "fail"
                }
              />
            </div>
          </div>

          {/* Browser → Supabase */}
          <div className="flex min-h-14 items-center justify-between gap-4 py-2.5 last:pb-0">
            <div className="min-w-0">
              <p className="text-[15px]">Browser link</p>
              <p
                className={cn(
                  "mt-0.5 truncate text-[13px]",
                  browserPing && !browserPing.ok ? "text-destructive" : "text-muted-foreground"
                )}
              >
                {browserBusy ? "Pinging the Supabase project…" : linkHint(browserPing)}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className="text-[13px] font-medium">{linkLabel(browserPing)}</span>
              <StatusDot state={browserBusy ? "loading" : browserPing?.ok ? "ok" : "fail"} />
            </div>
          </div>
        </div>

        {!configured && (
          <p className="mt-3 rounded-lg bg-destructive/5 px-3 py-2 text-[13px] text-destructive">
            Supabase environment variables are missing. Set{" "}
            <code className="font-mono text-[12px]">NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
            <code className="font-mono text-[12px]">NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code> in{" "}
            <code className="font-mono text-[12px]">.env</code>, then restart the server.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
