# Fixing the production auth flow (OTP → auto-login)

## TL;DR — what was broken

`verifyOtp()` succeeds (Supabase Auth is fine), but every user then landed on the
login screen and could not log in. Verified causes, in the order they bite:

1. **The Supabase DATABASE host is unreachable** — `DATABASE_URL` uses the direct
   host `db.<ref>.supabase.co`, which on the free tier is **IPv6-only**
   (DNS has only an AAAA record). Vercel serverless functions (and IPv4-only
   networks) cannot connect → **every Prisma call fails with 500** → the
   `/api/auth/bridge` call fails → the app considered the user "not signed in".
   *Fix: use the Supabase pooler connection string (IPv4-compatible), see below.*
2. **Prisma client/schema mismatch** — `scripts/prisma-generate.mjs` did not read
   `.env`, so a **SQLite** client could be generated while the runtime loaded a
   `postgres://` `DATABASE_URL` → "the URL must start with the protocol `file:`"
   → same 500s. *Fixed in `scripts/prisma-generate.mjs` (it now loads `.env` the
   same way Next.js does).*
3. **Client collapsed valid sessions** — the session store treated a failed
   bridge as "logged out" and the OTP screen bridged fire-and-forget before a
   blind hard redirect. *Fixed in `src/lib/session-store.ts` +
   `src/features/auth/views/verify-email-view.tsx` (degraded mode + awaited,
   verified bridge with retry).*

## Required environment fix (Supabase dashboard + Vercel)

The direct `db.<ref>.supabase.co` host is IPv6-only on the free plan. Use the
**pooler** host, which works over IPv4 from Vercel and local machines.

**CONFIRMED for this project** (`ulhubxawckcrfsyrrqqp`): home region is
**ap-southeast-1** — the working pooler host is
`aws-0-ap-southeast-1.pooler.supabase.com` (verified with a real authenticated
`SELECT 1` through the transaction pooler).

1. Use these shapes (same password as the current direct URL):
   - `DATABASE_URL=postgresql://postgres.<PROJECT_REF>:<PASSWORD>@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres?schema=kivo&pgbouncer=true&connection_limit=1`
   - `DIRECT_DATABASE_URL=postgresql://postgres.<PROJECT_REF>:<PASSWORD>@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres?schema=kivo`
2. Set BOTH in **Vercel → Project → Settings → Environment Variables** (all
   environments) — the deployed build must also have the Supabase public env
   vars (`NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   or the `VITE_` variants).
3. Same values are now applied in the local `.env`.
4. **Schema push caveat**: `prisma db push` / `migrate` need a DIRECT (session)
   connection for advisory locks — run them against `DIRECT_DATABASE_URL`
   (port **5432**, no pgbouncer). Pushing through the transaction pooler
   (6543/pgbouncer) hangs. One-time push command:
   ```
   # run with DIRECT_DATABASE_URL (5432) as DATABASE_URL
   npx prisma db push --schema prisma/schema.postgres.prisma
   ```
   ✅ Already executed for this project — the remote DB is in sync.
5. Demo dataset restored on the new DB via `npx tsx prisma/seed.ts`
   (maya@kivo.app / KivoDemo1! + feed/spaces/notifications). ✅ Already done.
6. Redeploy the latest `main` (Vercel → Deployments → Redeploy). A stale
   deployment was serving pre-fix code; verify the deployment runs the latest
   commit.

## Verify after redeploying

```
# 1) server-side Supabase reachable (expect configured:true + ping ok)
curl https://<your-app>/api/supabase/health

# 2) bridge validation chain (expect 401 "Your session could not be verified…",
#    NOT "Supabase not configured" and NOT 500)
curl -X POST https://<your-app>/api/auth/bridge -H "content-type: application/json" \
  -d '{"accessToken":"fake-token-for-diagnostic-1234567890"}'

# 3) database reachable (expect 401 "Email or password is incorrect.", NOT 500)
curl -X POST https://<your-app>/api/auth/login -H "content-type: application/json" \
  -d '{"email":"probe@example.com","password":"whatever1"}'
```

Then in a browser: sign up → receive the real 6-digit code → enter it →
the app must land on Home, authenticated (no login page), and survive a refresh.
