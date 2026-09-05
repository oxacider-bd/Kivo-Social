/**
 * Production E2E diagnostic â€” exercises the REAL auth + bridge + feed chain:
 *   1. disposable mailbox (mail.tm JSON API)
 *   2. real Supabase signup on the live project (publishable key only)
 *   3. read the real OTP from the inbox
 *   4. real verifyOtp -> real session
 *   5. call the REAL production /api/auth/bridge with that token
 *   6. call the REAL production /api/feed with the resulting cookie
 * Prints statuses + safe details only (never tokens, passwords or the OTP).
 */
const SB = "https://ulhubxawckcrfsyrrqqp.supabase.co";
const KEY = "sb_publishable_yhOKegAXOI4JR_vW87OpFg_St86-zlo";
const VERCEL = "https://kivo-rho-pearl.vercel.app";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function jfetch(url, opts = {}) {
  const res = await fetch(url, opts);
  let body = null;
  try { body = await res.json(); } catch { /* ignore */ }
  return { res, body };
}

// â”€â”€ 1. disposable mailbox â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const domainsRes = await jfetch("https://api.mail.tm/domains");
const domain = domainsRes.body?.["hydra:member"]?.[0]?.domain;
if (!domain) { console.log("MAILBOX_FAIL: no mail.tm domain"); process.exit(1); }
const mailboxUser = "kivodiag" + Math.random().toString(36).slice(2, 8);
const mailboxAddr = `${mailboxUser}@${domain}`;
const mailboxPass = crypto.randomUUID() + "!Aa1";
const acc = await jfetch("https://api.mail.tm/accounts", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ address: mailboxAddr, password: mailboxPass }),
});
if (!acc.res.ok) { console.log("MAILBOX_FAIL:", acc.res.status); process.exit(1); }
const tok = await jfetch("https://api.mail.tm/token", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ address: mailboxAddr, password: mailboxPass }),
});
const mailToken = tok.body?.token;
if (!mailToken) { console.log("MAILBOX_TOKEN_FAIL"); process.exit(1); }
console.log("MAILBOX_OK:", mailboxAddr.replace(/(.{3}).*(@.*)/, "$1***$2"));

// â”€â”€ 2. Supabase signup â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const appPass = "Xk" + crypto.randomUUID().replace(/-/g, "") + "!9Z";
let signup = null;
for (let attempt = 1; attempt <= 15; attempt++) {
  signup = await jfetch(`${SB}/auth/v1/signup`, {
    method: "POST",
    headers: { apikey: KEY, "content-type": "application/json" },
    body: JSON.stringify({
      email: mailboxAddr,
      password: appPass,
      data: { full_name: "KIVO Diagnostics", username: "kivodiag" },
    }),
  });
  if (signup.res.status !== 429 && !(signup.res.status === 500 && /confirmation email/i.test(signup.body?.msg ?? ""))) break;
  console.log(`signup 429 (attempt ${attempt}) â€” waiting 30sâ€¦`);
  await sleep(240_000);
}
console.log("SIGNUP_STATUS:", signup.res.status, "error_code:", signup.body?.error_code ?? "-", "msg:", signup.body?.msg ?? signup.body?.error_description ?? signup.body?.error ?? "-");
if (!signup.res.ok) process.exit(1);

// â”€â”€ 3. read the OTP from the inbox â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
let otp = null;
for (let i = 0; i < 12 && !otp; i++) {
  await sleep(5_000);
  const list = await jfetch("https://api.mail.tm/messages", {
    headers: { authorization: `Bearer ${mailToken}` },
  });
  const msgs = list.body?.["hydra:member"] ?? [];
  if (msgs.length === 0) continue;
  const full = await jfetch(`https://api.mail.tm/messages/${msgs[0].id}`, {
    headers: { authorization: `Bearer ${mailToken}` },
  });
  const text = `${full.body?.text ?? ""} ${full.body?.html?.join(" ") ?? ""}`;
  const m = text.match(/\b(\d{6})\b/);
  if (m) otp = m[1];
}
if (!otp) { console.log("OTP_NOT_RECEIVED"); process.exit(1); }
console.log("OTP_RECEIVED: yes (6 digits)");

// â”€â”€ 4. verify â†’ real session â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const verify = await jfetch(`${SB}/auth/v1/verify`, {
  method: "POST",
  headers: { apikey: KEY, "content-type": "application/json" },
  body: JSON.stringify({ type: "signup", email: mailboxAddr, token: otp }),
});
console.log("VERIFY_STATUS:", verify.res.status, "hasSession:", Boolean(verify.body?.access_token));
if (!verify.body?.access_token) process.exit(1);
const accessToken = verify.body.access_token;

// â”€â”€ 5. REAL production bridge â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const bridge = await fetch(`${VERCEL}/api/auth/bridge`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ accessToken }),
});
const setCookies = bridge.headers.getSetCookie?.() ?? [];
const cookieLine = setCookies.find((c) => c.startsWith("kivo_session="));
const appCookie = cookieLine ? cookieLine.split(";")[0] : null;
let bridgeBody = null;
try { bridgeBody = await bridge.json(); } catch { /* ignore */ }
console.log("BRIDGE_STATUS:", bridge.status, "code:", bridgeBody?.error?.code ?? "(ok)", "cookieSet:", Boolean(appCookie));
if (bridgeBody?.error?.message) console.log("BRIDGE_MSG:", bridgeBody.error.message);
if (!bridge.res.ok) process.exit(1);

// â”€â”€ 6. REAL production feed with the bridge cookie â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const feed = await jfetch(`${VERCEL}/api/feed?limit=8`, {
  headers: appCookie ? { cookie: appCookie } : {},
});
console.log("FEED_STATUS:", feed.res.status, "items:", Array.isArray(feed.body?.data?.items) ? feed.body.data.items.length : "?");
if (feed.res.ok) {
  const first = feed.body?.data?.items?.[0];
  console.log("FEED_FIRST_POST:", first ? `author=${first.author?.username ?? "?"} len=${(first.content ?? "").length}` : "(empty)");
}
console.log("E2E_DONE");
