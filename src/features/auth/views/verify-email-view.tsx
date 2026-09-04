"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useSession } from "@/lib/session-store";
import { navigateTo } from "@/lib/router";
import { verifyEmailOtp, resendSignupOtp } from "@/services/auth";
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

/**
 * "Verify your email" — the dedicated screen for signup email confirmation.
 *
 * Supabase Auth emails the real 6-digit code ({{ .Token }} template); this
 * screen collects it and hands it to supabase.auth.verifyOtp() via the auth
 * service. Only the pending email (never the code, never the password) lives
 * in sessionStorage so a normal refresh keeps the flow alive.
 */

const OTP_LENGTH = 6;
/** Seconds before "Resend code" becomes available again (Supabase allows
 *  resending at any time; the cooldown protects users from hammering the
 *  email rate limit). */
const RESEND_COOLDOWN_SECONDS = 60;

export default function VerifyEmailView() {
  const pending = useRef(getPendingVerification());
  const email = pending.current?.email ?? "";

  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [verified, setVerified] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorNonce, setErrorNonce] = useState(0); // re-triggers the slot shake
  const [status, setStatus] = useState<string | null>(null); // aria-live (resend ok)

  const [resending, setResending] = useState(false);
  const [resendIn, setResendIn] = useState(() => {
    // Restore a fair cooldown after a refresh: 60s from the last code request.
    const elapsed = pending.current
      ? Math.floor((Date.now() - pending.current.at) / 1000)
      : RESEND_COOLDOWN_SECONDS;
    return Math.max(0, RESEND_COOLDOWN_SECONDS - elapsed);
  });

  // No pending verification (new tab / already cleared) → back to signup.
  useEffect(() => {
    if (!email) navigateTo("/signup", { replace: true });
  }, [email]);

  // Resend countdown.
  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  async function onVerify(e: FormEvent) {
    e.preventDefault();
    if (verifying || verified) return; // no duplicate requests
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
      await verifyEmailOtp(email, code);
      setVerified(true);
      clearPendingVerification();
      setStatus("Email verified. Taking you into KIVO…");

      // Resolve the centralized auth state (bridge + profile) — no second login.
      const user = await useSession.getState().refresh();
      if (!user) throw new Error("Email verified — but signing you in failed. Try again.");
      toast(`Welcome to KIVO, ${user.profile.fullName.split(" ")[0]}!`);
      setTimeout(() => navigateTo("/", { replace: true }), 800);
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
      // Rate limits and failures surface as polished KIVO messages
      // (mapSupabaseError) — never raw Supabase errors.
      setError(err instanceof Error ? err.message : "Couldn't send a new code right now. Please try again.");
    } finally {
      setResending(false);
    }
  }

  function onChangeEmail() {
    // Back to the signup form, prefilled — no duplicate account is created
    // (Supabase re-sends for an unconfirmed address instead of duplicating).
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
            className="mt-8 flex justify-center"
            role="status"
            aria-live="polite"
          >
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-hidden="true" />
          </div>
        ) : (
          <form onSubmit={onVerify} className="mt-8 space-y-5" noValidate>
            <OtpInput
              key={errorNonce}
              value={code}
              onChange={(digits) => {
                setCode(digits);
                if (error) setError(null); // clear invalid state as the user edits
              }}
              length={OTP_LENGTH}
              disabled={verifying}
              error={Boolean(error)}
              label="6-digit verification code from your email"
              describedBy={error ? "otp-error" : "otp-status"}
            />

            {/* Screen-reader status (resend success / progress) */}
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
