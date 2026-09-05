"use client";

import { getSupabaseBrowserClient } from "@/lib/supabase";
import { mapSupabaseError } from "@/lib/supabase-errors";
import { api } from "@/lib/api";
import { useSession } from "@/lib/session-store";
import type { SessionUser } from "@/types";

/**
 * Supabase authentication services — the ONLY place auth operations live.
 *
 * Real Supabase Auth is the identity provider:
 *   - signUp / signIn / signOut / password reset / password update
 *   - sessions persist via the Supabase SDK (localStorage) — tokens are
 *     never stored or managed manually.
 *
 * The demo / legacy account (seeded only in the app database) falls back to
 * the app's own cookie login when Supabase has no such user; every new
 * account is a real Supabase Auth user.
 */

export interface SignUpInput {
  fullName: string;
  username: string;
  email: string;
  password: string;
}

export type SignUpResult = { status: "signed-in" | "confirmation-required" };

/**
 * Create a real Supabase Auth user. `full_name` and `username` travel in
 * user_metadata so the existing create-profile trigger can build the
 * profiles row. We never insert into `profiles` ourselves.
 */
export async function signUp(input: SignUpInput): Promise<SignUpResult> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.auth.signUp({
    email: input.email,
    password: input.password,
    options: {
      data: {
        full_name: input.fullName,
        username: input.username,
      },
    },
  });
  if (error) throw mapSupabaseError(error);

  if (process.env.NODE_ENV !== "production") {
    // Safe diagnostics — booleans/ids only. Never the password or tokens.
    console.info("[kivo-auth:dev] signUp result", {
      hasUser: Boolean(data.user),
      userId: data.user?.id ?? null,
      hasSession: Boolean(data.session),
      identityCount: Array.isArray(data.user?.identities) ? data.user!.identities.length : null,
    });
  }

  // GoTrue quirk: signing up with an ALREADY-CONFIRMED email returns 200 with
  // the user, identities: [] and NO session. That is not a pending signup —
  // the account exists, so the OTP flow must not swallow the user here.
  if (!data.session && data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
    throw new Error("An account with this email already exists. Try signing in instead.");
  }
  if (!data.session) return { status: "confirmation-required" };
  return { status: "signed-in" };
}

/**
 * One-click demo entry. The server provisions the demo session directly —
 * no credentials live in (or travel through) the client. Disabled when the
 * deployment sets DEMO_LOGIN_ENABLED=false.
 */
export async function signInDemo(): Promise<SessionUser> {
  const user = await api<SessionUser>("/api/auth/demo", { body: {} });
  useSession.getState().setUser(user);
  return user;
}

/**
 * Sign in with Supabase Auth. For accounts that exist only in the app's
 * legacy database (the demo account), transparently falls back to the
 * legacy cookie login so that flow keeps working.
 * Returns which identity provider accepted the credentials.
 */
export async function signIn(email: string, password: string): Promise<"supabase" | "local"> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (!error) return "supabase";

  const isBadCredentials =
    (error.code ?? "") === "invalid_credentials" || /invalid login credentials/i.test(error.message);
  if (isBadCredentials) {
    // Legacy fallback — the demo account predates the Supabase integration.
    try {
      const user = await api<SessionUser>("/api/auth/login", {
        body: { email, password },
      });
      useSession.getState().setUser(user);
      return "local";
    } catch {
      // Legacy login also failed — throw the Supabase error with context
      throw new Error("Email or password is incorrect. Please check your credentials and try again.");
    }
  }
  // For all other errors (email_not_confirmed, rate_limit, etc.), throw with the actual message
  throw mapSupabaseError(error);
}

/** Send the password-recovery email. The link returns to #/reset-password. */
export async function requestPasswordReset(email: string): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  const redirectTo = `${window.location.origin}/#/reset-password`;
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
  if (error) throw mapSupabaseError(error);
}

/**
 * Verify the signup email with the REAL 6-digit OTP from the Supabase email
 * (the project's template uses {{ .Token }}). On success Supabase
 * establishes the session in the browser client — no second login needed.
 * Returns the session if auto-login succeeded, null otherwise.
 */
export async function verifyEmailOtp(
  email: string,
  token: string
): Promise<{ session: any | null; user: any | null }> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.auth.verifyOtp({
    email,
    token,
    type: "email",
  });
  if (error) throw mapSupabaseError(error);

  if (process.env.NODE_ENV !== "production") {
    // Safe diagnostics — ids/booleans only. NEVER log tokens, passwords or OTPs.
    const { data: persisted } = await supabase.auth.getSession();
    console.info("[kivo-auth:dev] verifyOtp result", {
      email,
      userId: data.user?.id,
      hasUser: Boolean(data.user),
      hasSession: Boolean(data.session),
      sessionPersisted: Boolean(persisted.session),
    });
  }

  return { session: data?.session ?? null, user: data?.user ?? null };
}

/** Send a fresh confirmation OTP for a pending signup. */
export async function resendSignupOtp(email: string): Promise<void> {
  const { error } = await getSupabaseBrowserClient().auth.resend({
    type: "signup",
    email,
  });
  if (error) throw mapSupabaseError(error);
}

/** Set a new password for the currently authenticated user (recovery flow). */
export async function updatePassword(newPassword: string): Promise<void> {
  const { error } = await getSupabaseBrowserClient().auth.updateUser({ password: newPassword });
  if (error) throw mapSupabaseError(error);
}

/**
 * Change the signed-in user's password. The current password is verified by
 * re-authenticating against Supabase before the update — ownership is proven,
 * never assumed. Legacy (local-only) accounts use the app's own endpoint.
 */
export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  const { data } = await supabase.auth.getSession();

  if (data.session?.user) {
    const email = data.session.user.email ?? "";
    const { error: verifyError } = await supabase.auth.signInWithPassword({
      email,
      password: currentPassword,
    });
    if (verifyError) {
      if (
        (verifyError.code ?? "") === "invalid_credentials" ||
        /invalid login credentials/i.test(verifyError.message)
      ) {
        throw new Error("Your current password is incorrect.");
      }
      throw mapSupabaseError(verifyError);
    }
    await updatePassword(newPassword);
    return;
  }

  // Legacy account without a Supabase session.
  await api("/api/auth/change-password", {
    method: "POST",
    body: { currentPassword, newPassword },
  });
}

/** Sign out of Supabase Auth (the session store clears app state + cookie). */
export async function supabaseSignOut(): Promise<void> {
  await getSupabaseBrowserClient().auth.signOut();
}

/** Returns the live Supabase session, if any (used by the reset-password view). */
export async function getActiveSupabaseSession() {
  const { data } = await getSupabaseBrowserClient().auth.getSession();
  return data.session;
}
