// Production two-user realtime notification E2E.
// 1. two disposable mailboxes + two real Supabase signups (OTP read from inbox)
// 2. both users complete the app bridge (mirror user + app cookie)
// 3. user B subscribes to Supabase Realtime postgres_changes (recipient filter, RLS)
// 4. user A follows user B via the app API (cookie + Bearer)
// 5. assert: row in public.notifications (B REST read), realtime event received,
//    unread count >= 1, list contains it, mark-all-read persists is_read via ref_id.
// Prints statuses + safe details only (never tokens, passwords or OTPs).
import { createClient } from "@supabase/supabase-js";

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

async function createMailbox(tagName) {
  const d = await jfetch("https://api.mail.tm/domains");
  const domain = d.body?.["hydra:member"]?.[0]?.domain;
  const addr = `kivort${tagName}${Math.random().toString(36).slice(2, 7)}@${domain}`;
  const pass = crypto.randomUUID() + "!Aa1";
  const acc = await jfetch("https://api.mail.tm/accounts", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ address: addr, password: pass }),
  });
  if (!acc.res.ok) throw new Error("mailbox create failed " + acc.res.status);
  const tok = await jfetch("https://api.mail.tm/token", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ address: addr, password: pass }),
  });
  if (!tok.body?.token) throw new Error("mailbox token failed");
  return {
    addr,
    readOtp: async () => {
      for (let i = 0; i < 15; i++) {
        await sleep(5_000);
        const list = await jfetch("https://api.mail.tm/messages", {
          headers: { authorization: `Bearer ${tok.body.token}` },
        });
        const msgs = list.body?.["hydra:member"] ?? [];
        if (msgs.length === 0) continue;
        const full = await jfetch(`https://api.mail.tm/messages/${msgs[0].id}`, {
          headers: { authorization: `Bearer ${tok.body.token}` },
        });
        const text = `${full.body?.text ?? ""} ${full.body?.html?.join(" ") ?? ""}`;
        const m = text.match(/\b(\d{6})\b/);
        if (m) return m[1];
      }
      return null;
    },
  };
}

async function signupSupabase(email, username) {
  const pass = "Xk" + crypto.randomUUID().replace(/-/g, "") + "!9Z";
  for (let attempt = 1; attempt <= 40; attempt++) {
    const { res, body } = await jfetch(`${SB}/auth/v1/signup`, {
      method: "POST",
      headers: { apikey: KEY, "content-type": "application/json" },
      body: JSON.stringify({
        email,
        password: pass,
        data: { full_name: "E2E " + username.toUpperCase(), username },
      }),
    });
    const quota = res.status === 429 || (res.status === 500 && /confirmation email/i.test(body?.msg ?? ""));
    if (res.ok) return;
    if (!quota) {
      console.log(`SIGNUP_FAIL(${username}):`, res.status, body?.error_code ?? "-", body?.msg ?? "-");
      process.exit(1);
    }
    console.log(`signup throttled (${username}) attempt ${attempt} - waiting 60s`);
    await sleep(60_000);
  }
  console.log(`SIGNUP_QUOTA_EXHAUSTED(${username})`);
  process.exit(1);
}

async function verifyOtp(mailbox, email) {
  const otp = await mailbox.readOtp();
  if (!otp) { console.log("OTP_NOT_RECEIVED:", email.replace(/(.{3}).*(@.*)/, "$1***$2")); process.exit(1); }
  const { res, body } = await jfetch(`${SB}/auth/v1/verify`, {
    method: "POST",
    headers: { apikey: KEY, "content-type": "application/json" },
    body: JSON.stringify({ type: "signup", email, token: otp }),
  });
  if (!res.ok || !body?.access_token) {
    console.log("VERIFY_FAIL:", res.status, body?.error_code ?? "-");
    process.exit(1);
  }
  return { accessToken: body.access_token, userId: body.user.id };
}

async function bridge(accessToken) {
  const res = await fetch(`${VERCEL}/api/auth/bridge`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ accessToken }),
  });
  const setCookies = res.headers.getSetCookie?.() ?? [];
  const cookie = setCookies.find((c) => c.startsWith("kivo_session="))?.split(";")[0] ?? null;
  let body = null;
  try { body = await res.json(); } catch { /* ignore */ }
  if (!res.ok || !cookie) {
    console.log("BRIDGE_FAIL:", res.status, body?.error?.message ?? "-");
    process.exit(1);
  }
  return cookie;
}

// 1+2. two real users
const mailboxA = await createMailbox("a");
const mailboxB = await createMailbox("b");
const usernameA = "e2ea" + Math.random().toString(36).slice(2, 6);
const usernameB = "e2eb" + Math.random().toString(36).slice(2, 6);
await signupSupabase(mailboxA.addr, usernameA);
await signupSupabase(mailboxB.addr, usernameB);
console.log("SIGNUPS_OK (both users created; waiting for OTP emails)");

const [userA, userB] = await Promise.all([verifyOtp(mailboxA, mailboxA.addr), verifyOtp(mailboxB, mailboxB.addr)]);
console.log("VERIFY_OK: A", userA.userId.slice(0, 8), "B", userB.userId.slice(0, 8));

// 3. bridge both (mirror users + app cookies)
const cookieA = await bridge(userA.accessToken);
const cookieB = await bridge(userB.accessToken);
console.log("BRIDGE_OK: both users");

// 4. B subscribes to realtime (RLS-protected postgres_changes)
const supabaseB = createClient(SB, KEY, { auth: { persistSession: false, autoRefreshToken: false } });
supabaseB.realtime.setAuth(userB.accessToken);
let resolveEvent = null;
const realtimeEvent = new Promise((resolve) => { resolveEvent = resolve; });
supabaseB
  .channel(`e2e:notifications:${userB.userId}`)
  .on(
    "postgres_changes",
    { event: "INSERT", schema: "public", table: "notifications", filter: `recipient_id=eq.${userB.userId}` },
    (payload) => resolveEvent(payload.new ?? {}),
  )
  .subscribe((state) => console.log("B_CHANNEL:", state));
await sleep(3_000); // let the channel reach SUBSCRIBED

// 5. A follows B (notification-producing action)
const follow = await jfetch(`${VERCEL}/api/follows`, {
  method: "POST",
  headers: { "content-type": "application/json", cookie: cookieA, authorization: `Bearer ${userA.accessToken}` },
  body: JSON.stringify({ username: usernameB }),
});
console.log("FOLLOW_STATUS:", follow.res.status, follow.body?.data?.status ?? follow.body?.error?.message ?? "-");

// 6. assertions
const timeout = new Promise((resolve) => setTimeout(() => resolve(null), 20_000));
const row = await Promise.race([realtimeEvent, timeout]);
console.log("REALTIME_EVENT_RECEIVED:", row ? `type=${row.type} ref_id=${row.ref_id ? "yes" : "no"}` : "NO (timeout 20s)");

const bRows = await jfetch(`${SB}/rest/v1/notifications?recipient_id=eq.${userB.userId}&select=type,ref_id,is_read`, {
  headers: { apikey: KEY, authorization: `Bearer ${userB.accessToken}` },
});
console.log("SUPABASE_ROWS_FOR_B:", bRows.res.status, JSON.stringify(bRows.body ?? []));

const unread = await jfetch(`${VERCEL}/api/notifications/unread-count`, { headers: { cookie: cookieB } });
console.log("UNREAD_COUNT:", unread.res.status, JSON.stringify(unread.body?.data));

const list = await jfetch(`${VERCEL}/api/notifications?filter=all&limit=5`, { headers: { cookie: cookieB } });
const items = list.body?.data?.page?.items ?? [];
console.log("LIST_STATUS:", list.res.status, "items:", items.length, "first:", items[0]?.type ?? "-", "actor:", items[0]?.actor?.username ?? "-");

const markAll = await jfetch(`${VERCEL}/api/notifications/read`, {
  method: "POST",
  headers: { "content-type": "application/json", cookie: cookieB },
  body: JSON.stringify({ all: true }),
});
await sleep(2_500);
const after = await jfetch(`${SB}/rest/v1/notifications?recipient_id=eq.${userB.userId}&select=is_read`, {
  headers: { apikey: KEY, authorization: `Bearer ${userB.accessToken}` },
});
console.log("MARK_ALL:", markAll.res.status, "supabase_is_read:", JSON.stringify(after.body?.map((r) => r.is_read)));

const unreadAfter = await jfetch(`${VERCEL}/api/notifications/unread-count`, { headers: { cookie: cookieB } });
console.log("UNREAD_AFTER_MARK_ALL:", unreadAfter.body?.data?.count);

supabaseB.removeAllChannels();
console.log("E2E_DONE");
