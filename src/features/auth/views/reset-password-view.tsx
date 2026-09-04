"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { navigateTo } from "@/lib/router";
import {
  getActiveSupabaseSession,
  supabaseSignOut,
  updatePassword,
} from "@/services/auth";
import { AuthLayout } from "@/features/auth/components/auth-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  PASSWORD_CHECK_ROWS,
  meetsSupabasePasswordPolicy,
  supabasePasswordChecks,
} from "@/lib/password-policy";

/**
 * Set a new password after clicking the recovery email link.
 * Supabase exchanges the `?code=` from the link for a real session
 * automatically (detectSessionInUrl + PKCE); this view then updates the
 * password for the authenticated user via auth.uid() — no token is passed
 * through the frontend.
 */
export default function ResetPasswordView() {
  const [checking, setChecking] = useState(true);
  const [hasSession, setHasSession] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const session = await getActiveSupabaseSession();
        if (!cancelled) setHasSession(Boolean(session));
      } catch {
        if (!cancelled) setHasSession(false);
      } finally {
        if (!cancelled) setChecking(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Mirror of the live Supabase policy — the button affordance only;
  // Supabase Auth re-validates server-side and remains the final authority.
  const checks = supabasePasswordChecks(password);
  const valid = meetsSupabasePasswordPolicy(password);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setLoading(true);
    try {
      await updatePassword(password);
      // The recovery session ends here — sign back in with the new password.
      try {
        await supabaseSignOut();
      } catch {
        /* best-effort */
      }
      setDone(true);
      setTimeout(() => navigateTo("/login"), 1600);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reset your password. Try again.");
    } finally {
      setLoading(false);
    }
  }

  if (checking) {
    return (
      <AuthLayout>
        <div className="flex justify-center py-10" role="status" aria-label="Checking reset link">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden="true" />
        </div>
      </AuthLayout>
    );
  }

  if (!hasSession) {
    return (
      <AuthLayout>
        <div className="text-center">
          <h2 className="text-2xl font-bold tracking-tight">Invalid reset link</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            This link is missing its token or has expired. Request a fresh one.
          </p>
          <Button asChild className="mt-6 h-11">
            <Link href="#/forgot-password">Request new link</Link>
          </Button>
        </div>
      </AuthLayout>
    );
  }

  if (done) {
    return (
      <AuthLayout>
        <div className="text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/15">
            <ShieldCheck className="h-6 w-6 text-emerald-600" aria-hidden="true" />
          </div>
          <h2 className="mt-4 text-2xl font-bold tracking-tight">Password updated</h2>
          <p className="mt-2 text-sm text-muted-foreground">Redirecting you to sign in…</p>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Set a new password</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Pick something strong you don't use anywhere else.
        </p>

        <form onSubmit={onSubmit} className="mt-8 space-y-4" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="password">New password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={loading}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="confirm">Confirm password</Label>
            <Input
              id="confirm"
              type="password"
              autoComplete="new-password"
              placeholder="••••••••"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              disabled={loading}
            />
          </div>

          <ul className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
            {PASSWORD_CHECK_ROWS.map(({ key, label }) => (
              <li
                key={key}
                className={cn(
                  checks[key]
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-muted-foreground"
                )}
              >
                {label}
              </li>
            ))}
          </ul>

          {error && (
            <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          <Button type="submit" className="h-11 w-full text-[15px] font-semibold" disabled={loading || !valid}>
            {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            {loading ? "Updating…" : "Update password"}
          </Button>
        </form>
      </div>
    </AuthLayout>
  );
}
