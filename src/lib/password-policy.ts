/**
 * Mirror of this Supabase project's LIVE password policy
 * (Dashboard → Authentication → Settings → Password requirements).
 *
 * Probed directly against the Auth API (the weak_password error response):
 *   - minimum length: 6
 *   - at least one character of each class:
 *       abcdefghijklmnopqrstuvwxyz        (lowercase)
 *       ABCDEFGHIJKLMNOPQRSTUVWXYZ        (uppercase)
 *       0123456789                        (number)
 *       !@#$%^&*()_+-=[]{};'\:"|<>?,./`~  (special)
 *
 * This helper exists ONLY so the UI can show accurate requirements up front.
 * It is a hint/affordance layer — Supabase Auth remains the single source of
 * truth and re-validates every password server-side. If the dashboard policy
 * ever changes, update the constants here; the error mapper always relays
 * Supabase's own reasons at runtime regardless of these constants.
 */

export const SUPABASE_PASSWORD_MIN_LENGTH = 6;

/** The exact special-character set this project's Supabase policy requires. */
export const SUPABASE_PASSWORD_SPECIAL_CHARS = "!@#$%^&*()_+-=[]{};'\\:\"|<>?,./`~";

/** Character class matcher built from the exact set above (class-safe escaping). */
const SPECIAL_RE = new RegExp(
  `[${[...SUPABASE_PASSWORD_SPECIAL_CHARS].map((c) => ("\\]-".includes(c) ? `\\${c}` : c)).join("")}]`
);

export interface PasswordChecks {
  length: boolean;
  lower: boolean;
  upper: boolean;
  number: boolean;
  special: boolean;
}

/**
 * Evaluate a password against the live Supabase policy.
 * Pure and synchronous — used for the live requirement checklists.
 */
export function supabasePasswordChecks(pw: string): PasswordChecks {
  return {
    length: pw.length >= SUPABASE_PASSWORD_MIN_LENGTH,
    lower: /[a-z]/.test(pw),
    upper: /[A-Z]/.test(pw),
    number: /[0-9]/.test(pw),
    special: SPECIAL_RE.test(pw),
  };
}

/** Checklist rows for the UI, in display order. */
export const PASSWORD_CHECK_ROWS: ReadonlyArray<{
  key: keyof PasswordChecks;
  label: string;
}> = [
  { key: "length", label: `${SUPABASE_PASSWORD_MIN_LENGTH}+ characters` },
  { key: "lower", label: "a lowercase letter" },
  { key: "upper", label: "an uppercase letter" },
  { key: "number", label: "a number" },
  { key: "special", label: "a special character" },
];

/** True when every live Supabase requirement is satisfied. */
export function meetsSupabasePasswordPolicy(pw: string): boolean {
  const checks = supabasePasswordChecks(pw);
  return (
    checks.length && checks.lower && checks.upper && checks.number && checks.special
  );
}

/** Human-readable one-line description of the policy, for inline copy. */
export function describeSupabasePasswordPolicy(): string {
  return (
    `At least ${SUPABASE_PASSWORD_MIN_LENGTH} characters, including upper and lowercase ` +
    `letters, a number and a special character (like !@#).`
  );
}
