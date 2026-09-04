/**
 * Minimal hand-off state for the signup email-verification (OTP) flow.
 *
 * Stores ONLY the email awaiting verification and when the code was sent —
 * never the OTP itself (it lives only in the email Supabase sends) and never
 * the password. sessionStorage is used so the pending flow survives a normal
 * refresh in the same tab; a new tab starts fresh at the signup step.
 */

const PENDING_KEY = "kivo:pending-verification";

/** Key used to hand the email back to the signup form via "Change email". */
export const SIGNUP_PREFILL_EMAIL_KEY = "kivo:signup-prefill-email";

export interface PendingVerification {
  email: string;
  /** Epoch ms of the last code request — used to restore the resend cooldown. */
  at: number;
}

export function setPendingVerification(email: string): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(
      PENDING_KEY,
      JSON.stringify({ email, at: Date.now() } satisfies PendingVerification)
    );
  } catch {
    /* storage unavailable — the flow still works within this render */
  }
}

export function getPendingVerification(): PendingVerification | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(PENDING_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PendingVerification>;
    if (typeof parsed.email !== "string" || !parsed.email.includes("@")) return null;
    return { email: parsed.email, at: typeof parsed.at === "number" ? parsed.at : Date.now() };
  } catch {
    return null;
  }
}

export function clearPendingVerification(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(PENDING_KEY);
  } catch {
    /* ignore */
  }
}
