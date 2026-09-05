"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
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
import { useSession } from "@/lib/session-store";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import { Check, Loader2, MailCheck } from "lucide-react";
import { toast } from "sonner";

/**
 * "Verify your email" — the dedicated screen for signup email confirmation.
 *
 * Flow (no login page in between):
 *   verifyOtp() → setSession() → getSession() confirmation →
 *   AWAIT the KIVO bridge (finishEmailVerification) → app state refreshed →
 *   navigate home. The redirect NEVER happens before the app session is ready.
 *
 * If verification succeeds but the bridge fails, the user STAYS on this
 * screen with their valid Supabase session and a retry action — never
 * bounced to login, never logged out.
 */

const OTP_LENGTH = 6;
const RESEND_COOLDOWN_SECONDS = 60;

export default function VerifyEmailView() {
  // One-time snapshot of the pending verification hand-off (never the OTP,
  // never the password). useState initializer keeps this render-safe.
  const [pending] = useState(() => getPendingVerification());
  const email = pending?.email ?? "";

  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [verified, setVerified] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorNonce, setErrorNonce] = useState(0);
  const [status, setStatus] = useState<string | null>(null);
  /** Set when the email IS verified but the app bridge couldn't finish sign-in. */
  const [bridgeError, setBridgeError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [continuing, setContinuing] = useState(false);

  const [resending, setResending] = useState(false);
  const [resendIn, setResendIn] = useState(() => {
    const elapsed = pending
      ? Math.floor((Date.now() - pending.at) / 1000)
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

  // Safety net: never leave the auth listener suppressed after leaving this screen.
  useEffect(() => {
    return () => useSession.getState().endEmailVerification();
  }, []);

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
    setBridgeError(null);
    setStatus(null);
    setVerifying(true);

    const sessionStore = useSession.getState();
    // Take over hydration BEFORE verifyOtp() — the SIGNED_IN event it emits
    // must not race the explicit, awaited bridge sequence below.
    sessionStore.beginEmailVerification();

    try {
      // verifyOtp throws on failure — if it returns, verification SUCCEEDED.
      const { session } = await verifyEmailOtp(email, code);

      // Mark verified — no error banner for the OTP itself from here on.
      setVerified(true);
      clearPendingVerification();
      setStatus("Email verified! Finishing sign-in…");

      // 1) Persist the verified session in the SDK storage, then CONFIRM it.
      const supabase = getSupabaseBrowserClient();
      if (session?.access_token && session?.refresh_token) {
        try {
          await supabase.auth.setSession({
            access_token: session.access_token,
            refresh_token: session.refresh_token,
          });
        } catch {
          /* re-confirmed via getSession() below */
        }
      }
      const { data: confirmed } = await supabase.auth.getSession();
      const accessToken = confirmed.session?.access_token ?? null;

      if (process.env.NODE_ENV !== "production") {
        // Safe diagnostics — ids/booleans/pathname only, never tokens.
        console.info("[kivo-auth:dev] OTP verified", {
          pathname: `${window.location.pathname}${window.location.hash}`,
          hasUser: Boolean(confirmed.session?.user),
          sessionPersisted: Boolean(confirmed.session),
        });
      }

      if (!accessToken) {
        // verifyOtp succeeded but no session could be stored — stay here.
        setBridgeError(
          "Your verified session could not be stored in this browser. Please try again."
        );
        return;
      }

      // 2) AWAIT the KIVO bridge + hydration — no redirect until the app
      //    session is ready. On failure the Supabase session stays intact.
      const result = await sessionStore.finishEmailVerification(accessToken);
      if (!result.ok) {
        setBridgeError(result.message);
        return;
      }

      // 3) Fully signed in — SPA navigation (the session persists in storage).
      const user = useSession.getState().user;
      toast(`Welcome to KIVO, ${user?.profile.fullName.split(" ")[0] ?? "friend"}!`);
      navigateTo("/", { replace: true });
    } catch (err) {
      // Only verifyOtp failures land here — actual OTP errors.
      setVerified(false);
      setError(err instanceof Error ? err.message : "Invalid or expired code. Please try again.");
      setErrorNonce((n) => n + 1);
    } finally {
      sessionStore.endEmailVerification();
      setVerifying(false);
    }
  }

  /** Retry only the bridge/hydration step — the Supabase session is intact. */
  async function onRetrySync() {
    if (retrying) return;
    setRetrying(true);
    setBridgeError(null);
    const sessionStore = useSession.getState();
    sessionStore.beginEmailVerification();
    try {
      const supabase = getSupabaseBrowserClient();
      const { data } = await supabase.auth.getSession();
      const accessToken = data.session?.access_token ?? null;
      if (!accessToken) {
        setBridgeError("Your session has expired — please request a new code.");
        return;
      }
      const result = await sessionStore.finishEmailVerification(accessToken);
      if (!result.ok) {
        setBridgeError(result.message);
        return;
      }
      const user = useSession.getState().user;
      toast(`Welcome to KIVO, ${user?.profile.fullName.split(" ")[0] ?? "friend"}!`);
      navigateTo("/", { replace: true });
    } finally {
      sessionStore.endEmailVerification();
      setRetrying(false);
    }
  }

  /**
   * Continue with the Supabase session only (degraded mode) — for when the
   * app backend is temporarily unreachable. The store keeps retrying the
   * bridge in the background and the user is never bounced to login.
   */
  async function onContinueAnyway() {
    if (continuing) return;
    setContinuing(true);
    try {
      const user = await useSession.getState().refresh();
      if (user) {
        navigateTo("/", { replace: true });
      } else {
        setBridgeError("KIVO's servers are unreachable right now. Please try again shortly.");
      }
    } finally {
      setContinuing(false);
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
            bridgeError ? (
              "Your email is confirmed — one more step to bring you in."
            ) : (
              "Everything checks out — taking you into KIVO…"
            )
          ) : (
            <>
              We sent a 6-digit verification code to{" "}
              <span className="break-all font-medium text-foreground">{email}</span>
            </>
          )}
        </p>

        {verified && bridgeError ? (
          <div className="mt-8 space-y-3" role="alert" aria-live="polite">
            <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
              Email verified, but we couldn&apos;t finish signing you in. Please try again.
            </p>
            <p className="text-xs text-muted-foreground">{bridgeError}</p>
            <Button
              type="button"
              onClick={onRetrySync}
              disabled={retrying}
              className="h-11 w-full text-[15px] font-semibold"
            >
              {retrying && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              {retrying ? "Trying again…" : "Try again"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={onContinueAnyway}
              disabled={continuing}
              className="h-9 w-full text-sm font-semibold text-muted-foreground"
            >
              {continuing && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              Continue to KIVO anyway
            </Button>
          </div>
        ) : verified ? (
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
