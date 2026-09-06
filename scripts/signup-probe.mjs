// Live production signup probe — safe diagnostics only (no secrets logged).
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

const d = await jfetch("https://api.mail.tm/domains");
const domain = d.body?.["hydra:member"]?.[0]?.domain;
const addr = `kivofix${Math.random().toString(36).slice(2, 7)}@${domain}`;
const mp = crypto.randomUUID() + "!Aa1";
let acc = null;
for (let i = 0; i < 10 && !acc; i++) {
  if (i > 0) { console.log("mailbox throttled, retrying in 45s"); await sleep(45_000); }
  const a = await jfetch("https://api.mail.tm/accounts", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ address: addr, password: mp }),
  });
  if (a.res.ok) acc = a;
}
if (!acc) { console.log("MAILBOX_THROTTLED"); process.exit(1); }
console.log("MAILBOX_OK:", addr.replace(/(.{3}).*(@.*)/, "$1***$2"));
const mt = await jfetch("https://api.mail.tm/token", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ address: addr, password: mp }),
});

const pass = "Xk" + crypto.randomUUID().replace(/-/g, "") + "!9Z";
const username = "otpfix" + Math.random().toString(36).slice(2, 6);
let signup = null;
for (let attempt = 1; attempt <= 40; attempt++) {
  signup = await jfetch(`${SB}/auth/v1/signup`, {
    method: "POST",
    headers: { apikey: KEY, "content-type": "application/json" },
    body: JSON.stringify({
      email: addr,
      password: pass,
      data: { full_name: "OTP Fix Probe", username },
    }),
  });
  const quota =
    signup.res.status === 429 ||
    (signup.res.status === 500 && /confirmation email/i.test(signup.body?.msg ?? ""));
  if (signup.res.ok || !quota) break;
  if (attempt % 5 === 0) console.log(`signup throttled, attempt ${attempt}`);
  await sleep(60_000);
}
console.log(
  "SIGNUP_TRACE:",
  JSON.stringify({
    httpStatus: signup.res.status,
    errorCode: signup.body?.error_code ?? null,
    msg: signup.body?.msg ?? null,
    hasUser: Boolean(signup.body?.user?.id ?? signup.body?.id),
    hasSession: Boolean(signup.body?.access_token || signup.body?.session?.access_token),
  }),
);
const token = signup.body?.access_token || signup.body?.session?.access_token || null;
if (!token) {
  console.log("SIGNUP_NOT_COMPLETED (delivery still quota-blocked; client now shows the honest retry message)");
  process.exit(1);
}
console.log("SIGNUP_OK: session returned");
const bridge = await jfetch(`${VERCEL}/api/auth/bridge`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ accessToken: token }),
});
const cookie = bridge.headers.getSetCookie?.().find((x) => x.startsWith("kivo_session="))?.split(";")[0] ?? null;
console.log("BRIDGE:", bridge.status, "cookie:", Boolean(cookie));
const feed = await jfetch(`${VERCEL}/api/feed?limit=5`, { headers: cookie ? { cookie } : {} });
console.log("FEED_AS_NEW_USER:", feed.res.status, "items:", Array.isArray(feed.body?.data?.items) ? feed.body.data.items.length : "?");
console.log("E2E_DONE");