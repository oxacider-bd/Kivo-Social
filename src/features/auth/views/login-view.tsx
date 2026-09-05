"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useSession } from "@/lib/session-store";
import { navigateTo } from "@/lib/router";
import { signIn, signInDemo } from "@/services/auth";
import { setPendingVerification } from "@/lib/pending-verification";
import { AuthLayout } from "@/features/auth/components/auth-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function LoginView() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsVerification, setNeedsVerification] = useState(false);

  // Unconfirmed account: go straight to the dedicated OTP screen instead of
  // leaving the user on the login form with only a warning message.
  useEffect(() => {
    if (!needsVerification) return;
    setPendingVerification(email.trim());
    navigateTo("/verify-email", { replace: true });
  }, [needsVerification, email]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setNeedsVerification(false);
    setLoading(true);
    try {
      await signIn(email.trim(), password);
      const user = await useSession.getState().refresh();
      if (!user) throw new Error("Signed in but couldn't load your profile. Please try again.");
      toast(`Welcome back, ${user.profile.fullName.split(" ")[0]}!`);
      navigateTo("/", { replace: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not sign you in. Try again.";
      setError(message);
      setNeedsVerification(/verify your email/i.test(message));
    } finally {
      setLoading(false);
    }
  }

  async function onDemo() {
    setError(null);
    setDemoLoading(true);
    try {
      // The server provisions the demo session — no credentials in the client.
      const user = await signInDemo();
      await useSession.getState().refresh();
      toast(`Welcome back, ${user.profile.fullName.split(" ")[0]}!`);
      navigateTo("/", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start the demo. Try again.");
    } finally {
      setDemoLoading(false);
    }
  }

  return (
    <AuthLayout>
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Welcome back</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Sign in to pick up right where you left off.
        </p>

        <form onSubmit={onSubmit} className="mt-8 space-y-4" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={loading}
            />
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Password</Label>
              <Link
                href="#/forgot-password"
                className="text-xs font-medium text-brand hover:underline outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
              >
                Forgot password?
              </Link>
            </div>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={loading}
            />
          </div>

          {error && (
            <div role="alert" className="space-y-2">
              <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
              {needsVerification && (
                <button
                  type="button"
                  onClick={() => {
                    setPendingVerification(email.trim());
                    navigateTo("/verify-email", { replace: true });
                  }}
                  className="rounded text-sm font-semibold text-brand hover:underline outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  Enter your verification code →
                </button>
              )}
            </div>
          )}

          <Button type="submit" className="h-11 w-full text-[15px] font-semibold" disabled={loading}>
            {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            {loading ? "Signing in…" : "Sign in"}
          </Button>
        </form>

        <button
          type="button"
          onClick={onDemo}
          disabled={demoLoading || loading}
          className="mt-4 w-full rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground transition-colors hover:border-brand/40 hover:text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
        >
          {demoLoading && <Loader2 className="mr-1.5 inline h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
          Try the demo account — maya@kivo.app
        </button>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          New to KIVO?{" "}
          <Link href="#/signup" className="font-semibold text-brand hover:underline">
            Create an account
          </Link>
        </p>
      </div>
    </AuthLayout>
  );
}
