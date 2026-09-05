import { mapSupabaseError } from "../src/lib/supabase-errors";
const cases: Array<[string, { code?: string; message: string }]> = [
  ["SMTP delivery failure (the production bug)", { code: "unexpected_failure", message: "Error sending confirmation email" }],
  ["genuine unconfirmed login", { code: "email_not_confirmed", message: "Email not confirmed" }],
  ["user already registered", { message: "User already registered" }],
  ["email send rate limit", { code: "over_email_send_rate_limit", message: "Too many emails sent" }],
  ["invalid login", { code: "invalid_credentials", message: "Invalid login credentials" }],
  ["weak password", { code: "weak_password", message: "Password should be at least 8 characters." }],
];
for (const [label, err] of cases) {
  const mapped = mapSupabaseError(err).message;
  console.log(`${label}:\n  -> ${mapped}\n`);
}
