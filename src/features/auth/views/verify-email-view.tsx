"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useSession } from "@/lib/session-store";
import { navigateTo } from "@/lib/router";
import { verifyEmailOtp, resendSignupOtp, signIn } from "@/services/auth";
import {
  clearPendingVerification,
  getPendingVerification,
  SIGNUP_PREFILL_EMAIL_KEY,
} from "@/lib/pending-verification";
import { AuthLayout } from "@/features/auth/components/auth-layout";
import { OtpInput } from "@/features/auth/components/otp-input";
import { Button } from "@/components/ui/button";
import { Check, Loader2, MailCheck } from "lucide-react";
import { toast } from "sonner";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import { api } from "@/lib/api";
import type { SessionUser } from "@/types";

/**
 * "Verify your email" — the dedicated screen for signup email confirmation.
 *
 * After OTP verification succeeds and returns a session:
 * 1. Explicitly set the session in Supabase client storage
 * 2. Call the bridge API directly to create the app user + cookie
 * 3. Force a full page reload to / for fresh state
 */

const OTP_LENGTH = 6;
const RESEND_COOLDOWN_SECONDS = 60;

export default function VerifyEmailView() {
  const pending = useRef(getPendingVerification());
  const email = pending.current?.email ?? "";

  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [verified, setVerified] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorNonce, setErrorNonce] = useState(0);
  const [status, setStatus] = useState<string | null>(null);

  const [resending, setResending] = useState(false);
  const [resendIn, setResendIn] = useState(() => {
    const elapsed = pending.current
      ? Math.floor((Date.now() - pending.current.at) / 1000)
      : RESEND_COOLDOWN_SECONDS;
    return Math.max(0, RESEND_COOLDOWN_SECONDS - elapsed);
  });

  useEffect(() => {
    if (!email) navigateTo("/signup", { replace: true });
  }, [email]);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  /**
   * After verifyOtp returns a session, we must:
   * 1. Call setSession() to persist it in the SDK's storage
   * 2. Call the bridge to create the app user + cookie
   * 3. Force navigate to / for a clean state
   */
  async function handleSessionFromVerifyOtp(session: any): Promise<boolean> {
    const supabase = getSupabaseBrowserClient();

    // Step 1: Explicitly set the session in the SDK storage
    try {
      await supabase.auth.setSession({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
      });
      console.log("[verify-email] setSession succeeded");
    } catch (err) {
      console.warn("[verify-email] setSession failed, continuing anyway:", err);
    }

    // Step 2: Call bridge API to create app user + cookie
    try {
      const user = await api<SessionUser>("/api/auth/bridge", {
        body: { accessToken: session.access_token },
      });
      useSession.getState().setUser(user);
      toast(`Welcome to KIVO, ${user.profile.fullName.split(" ")[0]}!`);
      window.location.href = "/";
      return true;
    } catch (err) {
      console.warn("[verify-email] bridge call failed, trying direct approach:", err);
    }

    // Step 3: Bridge failed — try refresh() which has its own bridge logic
    try {
      const user = await useSession.getState().refresh();
      if (user) {
        toast(`Welcome to KIVO, ${user.profile.fullName.split(" ")[0]}!`);
        window.location.href = "/";
        return true;
      }
    } catch (err) {
      console.warn("[verify-email] refresh failed:", err);
    }

    return false;
  }

  /** Poll for session after verifyOtp — fallback if session wasn't in response. */
  async function waitForSession(maxMs = 8000): Promise<boolean> {
    const supabase = getSupabaseBrowserClient();
    const start = Date.now();
    while (Date.now() - start < maxMs) {
      try {
        const { data } = await supabase.auth.getSession();
        if (data.session?.user) {
          console.log("[verify-email] Found session in storage, bridging...");
          // Found a session — bridge it
          try {
            const user = await api<SessionUser>("/api/auth/bridge", {
              body: { accessToken: data.session.access_token },
            });
            useSession.getState().setUser(user);
            toast(`Welcome to KIVO, ${user.profile.fullName.split(" ")[0]}!`);
            window.location.href = "/";
            return true;
          } catch {
            // Bridge failed — try refresh()
            const user = await useSession.getState().refresh();
            if (user) {
              toast(`Welcome to KIVO, ${user.profile.fullName.split(" ")[0]}!`);
              window.location.href = "/";
              return true;
            }
          }
        }
      } catch {
        // transient — keep polling
      }
      await new Promise((r) => setTimeout(r, 300));
    }
    return false;
  }

  async function onVerify(e: FormEvent) {
    e.preventDefault();
    if (verifying || verified) return;
    if (!email) return;
    if (code.length !== OTP_LENGTH) {
      setError(`Enter all ${OTP_LENGTH} digits of the code.`);
      setErrorNonce((n) => n + 1);
      return;
    }
    setError(null);
    setStatus(null);
    setVerifying(true);
    try {
      const { session, user: supabaseUser } = await verifyEmailOtp(email, code);
      setVerified(true);
      clearPendingVerification();
      setStatus("Email verified. Signing you in…");

      console.log("[verify-email] verifyOtp result:", {
        hasSession: !!session,
        hasUser: !!supabaseUser,
        sessionKeys: session ? Object.keys(session) : [],
      });

      // Method 1: verifyOtp returned a session — use it IMMEDIATELY
      if (session?.user && session.access_token) {
        setStatus("Setting up your account…");
        if (await handleSessionFromVerifyOtp(session)) return;
      }

      // Method 1b: Session exists but maybe setSession is needed
      if (session?.access_token) {
        const supabase = getSupabaseBrowserClient();
        try {
          await supabase.auth.setSession({
            access_token: session.access_token,
            refresh_token: session.refresh_token,
          });
          // Now try to get it back
          const { data: { session: freshSession } } = await supabase.auth.getSession();
          if (freshSession?.user) {
            setStatus("Setting up your account…");
            const user = await api<SessionUser>("/api/auth/bridge", {
              body: { accessToken: freshSession.access_token },
            });
            useSession.getState().setUser(user);
            toast(`Welcome to KIVO, ${user.profile.fullName.split(" ")[0]}!`);
            window.location.href = "/";
            return;
          }
        } catch (err) {
          console.warn("[verify-email] setSession + getSession failed:", err);
        }
      }

      // Method 2: Poll for Supabase session (SDK may need a moment to persist it)
      setStatus("Waiting for session to establish…");
      if (await waitForSession(6000)) return;

      // Method 3: Try signing in with stored password
      const storedPassword = window.sessionStorage.getItem("signup_password");
      if (storedPassword) {
        setStatus("Signing in with your credentials…");
        try {
          await signIn(email, storedPassword);
          window.sessionStorage.removeItem("signup_password");
          const user = await useSession.getState().refresh();
          if (user) {
            toast(`Welcome to KIVO, ${user.profile.fullName.split(" ")[0]}!`);
            window.location.href = "/";
            return;
          }
        } catch {
          // signIn failed
        }
      }

      // If everything failed — show helpful message, do NOT redirect to /login
      setStatus(null);
      setVerified(false);
      setError(
        "Verification succeeded but we couldn't sign you in automatically. " +
        "Go to the sign-in page and enter your email and password."
      );
      setErrorNonce((n) => n + 1);
    } catch (err) {
      setVerified(false);
      setError(err instanceof Error ? err.message : "Couldn't verify your email right now. Please try again.");
      setErrorNonce((n) => n + 1);
    } finally {
      setVerifying(false);
    }
  }

  async function onResend() {
    if (resending || resendIn > 0 || verified || !email) return;
    setError(null);
    setStatus(null);
    setResending(true);
    try {
      await resendSignupOtp(email);
      setResendIn(RESEND_COOLDOWN_SECONDS);
      setStatus(`A new code is on its way to ${email}.`);
      toast("New code sent", { description: email });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't send a new code right now. Please try again.");
    } finally {
      setResending(false);
    }
  }

  function onChangeEmail() {
    try {
      window.sessionStorage.setItem(SIGNUP_PREFILL_EMAIL_KEY, email);
    } catch {
      /* ignore */
    }
    clearPendingVerification();
    navigateTo("/signup", { replace: true });
  }

  if (!email) return null;

  return (
    <AuthLayout>
      <div className="text-center">
        <div
          className={
            verified
              ? "mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/15 transition-all duration-300 scale-110"
              : "mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-brand-soft transition-all duration-300"
          }
        >
          {verified ? (
            <Check className="h-6 w-6 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
          ) : (
            <MailCheck className="h-6 w-6 text-brand" aria-hidden="true" />
          )}
        </div>

        <h2 className="mt-4 text-2xl font-bold tracking-tight">
          {verified ? "Email verified" : "Verify your email"}
        </h2>

        <p className="mt-2 text-sm text-muted-foreground">
          {verified ? (
            "Everything checks out — taking you into KIVO…"
          ) : (
            <>
              We sent a 6-digit verification code to{" "}
              <span className="break-all font-medium text-foreground">{email}</span>
            </>
          )}
        </p>

        {verified ? (
          <div
            className="mt-8 flex flex-col items-center gap-3"
            role="status"
            aria-live="polite"
          >
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">{status}</p>
          </div>
        ) : (
          <form onSubmit={onVerify} className="mt-8 space-y-5" noValidate>
            <OtpInput
              key={errorNonce}
              value={code}
              onChange={(digits) => {
                setCode(digits);
                if (error) setError(null);
              }}
              length={OTP_LENGTH}
              disabled={verifying}
              error={Boolean(error)}
              label="6-digit verification code from your email"
              describedBy={error ? "otp-error" : "otp-status"}
            />

            <p id="otp-status" className="sr-only" aria-live="polite">
              {status ?? (verifying ? "Verifying your code…" : "")}
            </p>

            {error && (
              <p
                id="otp-error"
                role="alert"
                className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
              >
                {error}
              </p>
            )}

            <Button
              type="submit"
              className="h-11 w-full text-[15px] font-semibold"
              disabled={verifying || code.length !== OTP_LENGTH}
            >
              {verifying && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              {verifying ? "Verifying…" : "Verify email"}
            </Button>
          </form>
        )}

        {!verified && (
          <div className="mt-8 space-y-2">
            <p className="text-sm text-muted-foreground">Didn&apos;t receive the code?</p>

            {resendIn > 0 ? (
              <Button
                type="button"
                variant="ghost"
                className="h-9 text-sm font-semibold text-muted-foreground"
                disabled
                aria-live="polite"
              >
                Resend in {resendIn}s
              </Button>
            ) : (
              <Button
                type="button"
                variant="ghost"
                onClick={onResend}
                disabled={resending}
                className="h-9 text-sm font-semibold text-brand hover:text-brand hover:bg-brand-soft"
              >
                {resending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                {resending ? "Sending…" : "Resend code"}
              </Button>
            )}

            <p className="pt-1 text-sm text-muted-foreground">
              Wrong address?{" "}
              <button
                type="button"
                onClick={onChangeEmail}
                className="rounded font-semibold text-brand hover:underline outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Change email
              </button>
            </p>

            <p className="pt-3 text-xs text-muted-foreground">
              Already confirmed?{" "}
              <Link href="#/login" className="font-semibold text-brand hover:underline">
                Sign in
              </Link>
            </p>
          </div>
        )}
      </div>
    </AuthLayout>
  );
}
