"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useSession } from "@/lib/session-store";
import { navigateTo } from "@/lib/router";
import { signUp } from "@/services/auth";
import { setPendingVerification, SIGNUP_PREFILL_EMAIL_KEY } from "@/lib/pending-verification";
import { AuthLayout } from "@/features/auth/components/auth-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Check, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  PASSWORD_CHECK_ROWS,
  supabasePasswordChecks,
} from "@/lib/password-policy";

export default function SignupView() {
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Prefill when arriving via "Change email" on the verification screen.
  useEffect(() => {
    try {
      const prefill = window.sessionStorage.getItem(SIGNUP_PREFILL_EMAIL_KEY);
      if (prefill) {
        setEmail(prefill);
        window.sessionStorage.removeItem(SIGNUP_PREFILL_EMAIL_KEY);
      }
    } catch {
      /* ignore */
    }
  }, []);

  // Live mirror of Supabase's actual password policy (hint layer only —
  // Supabase Auth re-validates and remains the final authority on submit).
  const checks = useMemo(() => supabasePasswordChecks(password), [password]);
  const usernameValid = /^[a-z0-9_]{3,20}$/.test(username);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!usernameValid) {
      setError("Usernames use 3–20 lowercase letters, numbers or underscores.");
      return;
    }
    setLoading(true);
    try {
      // Real Supabase Auth signup — full name + username travel as metadata
      // and the database trigger creates the profile row automatically.
      const result = await signUp({
        fullName: fullName.trim(),
        username: username.trim().toLowerCase(),
        email: email.trim(),
        password,
      });

      if (result.status === "confirmation-required") {
        // Hand off to the dedicated OTP verification screen. Only the email
        // (never the password or code) is stored, so a refresh stays recoverable.
        // Store password temporarily for auto-login after OTP verification
        try {
          window.sessionStorage.setItem("signup_password", password);
        } catch {
          /* ignore */
        }
        setPendingVerification(email.trim());
        navigateTo("/verify-email", { replace: true });
        return;
      }

      // Resolve the centralized auth state (profile trigger + bridge).
      const user = await useSession.getState().refresh();
      if (!user) throw new Error("Account created — but sign-in failed. Try again.");
      toast(`Welcome to KIVO, ${user.profile.fullName.split(" ")[0]}!`);
      navigateTo("/", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create your account. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout>
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Create your account</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Join KIVO — it takes less than a minute.
        </p>

        <form onSubmit={onSubmit} className="mt-8 space-y-4" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="fullName">Full name</Label>
            <Input
              id="fullName"
              autoComplete="name"
              placeholder="Maya Rahman"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
              maxLength={50}
              disabled={loading}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="username">Username</Label>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">@</span>
              <Input
                id="username"
                autoComplete="username"
                placeholder="mayar"
                className="pl-8"
                value={username}
                onChange={(e) => setUsername(e.target.value.toLowerCase())}
                required
                maxLength={20}
                disabled={loading}
                aria-describedby="username-hint"
              />
            </div>
            <p id="username-hint" className="text-xs text-muted-foreground">
              3–20 characters · lowercase letters, numbers, underscores
            </p>
          </div>

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
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={loading}
              aria-describedby="pw-checks"
            />
            <ul id="pw-checks" className="grid grid-cols-2 gap-x-3 gap-y-1 pt-1">
              {PASSWORD_CHECK_ROWS.map(({ key, label }) => (
                <li
                  key={key}
                  className={cn(
                    "flex items-center gap-1.5 text-xs transition-colors",
                    checks[key] ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground",
                  )}
                >
                  {checks[key] ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                  {label}
                </li>
              ))}
            </ul>
          </div>

          {error && (
            <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          <Button type="submit" className="h-11 w-full text-[15px] font-semibold" disabled={loading}>
            {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            {loading ? "Creating your account…" : "Create account"}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          Already here?{" "}
          <Link href="#/login" className="font-semibold text-brand hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </AuthLayout>
  );
}
