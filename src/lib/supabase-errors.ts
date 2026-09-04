import {
  SUPABASE_PASSWORD_MIN_LENGTH,
  describeSupabasePasswordPolicy,
} from "@/lib/password-policy";

/**
 * Maps raw Supabase Auth/API errors into clean, user-friendly messages.
 * Raw database or internal errors are never surfaced to users.
 *
 * For weak-password errors the mapper relays Supabase's OWN requirements
 * (machine-readable `reasons` + the min length parsed from its message)
 * instead of a hardcoded rule list — so if the project's password policy is
 * ever tuned in the dashboard, users still see the truth.
 */

/** Subset of supabase-js AuthError/AuthWeakPasswordError this mapper needs. */
export interface RawAuthErrorLike {
  code?: string | null;
  message?: string | null;
  status?: number;
  name?: string;
  /** Present on AuthWeakPasswordError (GoTrue's `weak_password.reasons`). */
  reasons?: readonly string[];
}

/**
 * Builds the friendly message for a weak_password error using what Supabase
 * itself reported. `reasons` values seen in the wild: "length", "characters",
 * (and "leaked" when leaked-password protection is enabled).
 */
function describeWeakPassword(reasons: readonly string[], msg: string): string {
  const has = (reason: string) =>
    reasons.length > 0 ? reasons.includes(reason) : null;

  // Supabase states its configured minimum, e.g. "at least 10 characters".
  const parsedMin = Number(msg.match(/at least (\d+) characters?/i)?.[1]);
  const minLength = Number.isFinite(parsedMin) && parsedMin > 0
    ? parsedMin
    : SUPABASE_PASSWORD_MIN_LENGTH;

  const lengthFailed = has("length") ?? /at least \d+ characters?/i.test(msg);
  const charactersFailed =
    has("characters") ?? /one character of each|character classes/i.test(msg);

  if (lengthFailed && charactersFailed) {
    return (
      `Your password needs at least ${minLength} characters, including upper and ` +
      `lowercase letters, a number and a special character (like !@#).`
    );
  }
  if (lengthFailed) {
    return `Your password needs to be at least ${minLength} characters.`;
  }
  if (charactersFailed) {
    return (
      `Your password must include upper and lowercase letters, a number and a ` +
      `special character (like !@#).`
    );
  }
  return (
    `That password doesn't meet the password requirements — try a longer mix of ` +
    `letters, numbers and symbols.`
  );
}

export function mapSupabaseError(error: RawAuthErrorLike): Error {
  const code = (error.code ?? "").toLowerCase();
  const msg = error.message ?? "";
  const isWeakPasswordError =
    code === "weak_password" ||
    error.name === "AuthWeakPasswordError" ||
    /weak password|password should/i.test(msg);

  if (code === "user_already_exists" || /already registered|user already exists/i.test(msg)) {
    return new Error("An account with this email already exists. Try signing in instead.");
  }
  if (code === "invalid_credentials" || /invalid login credentials/i.test(msg)) {
    return new Error("Email or password is incorrect.");
  }
  if (code === "email_not_confirmed" || /email not confirmed|confirm.*email/i.test(msg)) {
    return new Error("Please verify your email first — enter the 6-digit code we emailed you.");
  }
  if (code === "user_not_found" || /user not found/i.test(msg)) {
    return new Error("No account found with that email.");
  }
  if (
    code === "over_email_send_rate_limit" ||
    code === "over_request_rate_limit" ||
    /rate limit|too many requests/i.test(msg)
  ) {
    return new Error("Too many attempts. Please wait a minute and try again.");
  }
  // Leaked-password protection (when enabled) — a distinct reason users must
  // understand; checked before the generic weak-password mapping.
  if (
    reasonsInclude(error.reasons, "leaked") ||
    /known to be weak|data breach|pwned|previously exposed|found in a breach/i.test(msg)
  ) {
    return new Error(
      "This password has appeared in a real data breach, so it can't be used. Please choose a different one."
    );
  }
  // "New password should be different from the old password." must be matched
  // BEFORE the broad weak-password pattern below (its text also contains
  // "password should").
  if (code === "same_password" || /same as the (old|previous)|different from the (old|previous)/i.test(msg)) {
    return new Error("Your new password must be different from the old one.");
  }
  if (isWeakPasswordError) {
    return new Error(describeWeakPassword(error.reasons ?? [], msg));
  }
  if (/database error saving new user/i.test(msg)) {
    return new Error("We couldn't create your account. Your email or username may already be in use.");
  }
  if (/failed to fetch|networkerror|load failed/i.test(msg)) {
    return new Error("You seem offline. Check your connection and try again.");
  }
  if (error.status === 42501 || /row-level security|permission denied/i.test(msg)) {
    return new Error("You don't have permission to do that.");
  }
  if (/refresh_token_not_found|invalid refresh token/i.test(msg)) {
    return new Error("Your session has expired. Please sign in again.");
  }
  // Email OTP verification — GoTrue returns otp_expired for BOTH wrong and
  // expired codes (verified against the live API: 403 otp_expired, "Token has
  // expired or is invalid"), so the message covers both honestly.
  if (
    code === "otp_expired" ||
    code === "otp_invalid" ||
    /token has expired|email link is invalid|\botp\b/i.test(msg)
  ) {
    return new Error(
      "That code isn't valid — it may have expired. Double-check the 6 digits or request a new one."
    );
  }
  if (/signup requires a valid password|password cannot be empty|empty password/i.test(msg)) {
    return new Error(`Please enter a valid password — ${lowerFirst(describeSupabasePasswordPolicy())}`);
  }
  if (/email address.*invalid|invalid email/i.test(msg)) {
    return new Error("That email address doesn't look valid.");
  }
  return new Error("Something went wrong. Please try again.");
}

function reasonsInclude(reasons: readonly string[] | undefined, reason: string): boolean {
  return Array.isArray(reasons) && reasons.includes(reason);
}

function lowerFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1);
}
