# KIVO — Social, but cleaner.

A premium social platform: feeds, Spaces, 24-hour moments, collections, realtime notifications, and AI-assisted posting — built with Next.js, Supabase, and Tailwind CSS.

## Stack

| Layer      | Technology                                                        |
| ---------- | ----------------------------------------------------------------- |
| Frontend   | Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS 4  |
| Identity   | Supabase Auth (email + 6-digit OTP verification, PKCE recovery)   |
| Database   | Supabase Postgres (production) · SQLite via Prisma (local dev)    |
| Storage    | Supabase Storage (`avatars`, `covers`, `post-media`, `moment-media`) |
| Realtime   | Supabase Realtime on `public.notifications` (postgres_changes)    |

## Quickstart (local development)

```bash
bun install

# 1. Configure environment
cp .env.example .env         # fill in the Supabase URL + publishable key
#   local SQLite default: DATABASE_URL=file:./db/custom.db

# 2. Create the local database and seed fictional demo data
bun run db:push
bun prisma/seed.ts

# 3. Run
bun run dev                  # http://localhost:3000
```

Demo entry: use the **“Try the demo account”** button on the sign-in screen.
The server provisions that session — no demo credentials live in the client
bundle. (The seeded accounts are fictional; their password comes from
`SEED_DEMO_PASSWORD` and is only used by `prisma/seed.ts`.)

## Environment variables

All values live in `.env` (gitignored). `.env.example` lists every name — never
commit real secrets. Required names:

| Variable                        | Purpose                                                                 |
| ------------------------------- | ----------------------------------------------------------------------- |
| `VITE_SUPABASE_URL`             | Supabase project URL (exposed to the browser bundle by design)          |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase **publishable/anon** key — never the service-role key          |
| `DATABASE_URL`                  | SQLite locally; the Supabase **pooled** Postgres URL on Vercel          |
| `DIRECT_DATABASE_URL`           | Supabase **direct** Postgres URL — used by `prisma db push` only        |
| `NEXT_PUBLIC_REALTIME_SOCKET`   | `1` only for local dev (socket.io fallback for legacy demo accounts)    |
| `DEMO_LOGIN_ENABLED`            | Set `false` to disable one-click demo access on a deployment            |
| `DEMO_LOGIN_EMAIL`              | Demo account email (default `maya@kivo.app`)                            |

> Two schema files share an identical data model: `prisma/schema.prisma`
> (SQLite) and `prisma/schema.postgres.prisma` (PostgreSQL). `scripts/prisma-generate.mjs`
> picks the right one automatically based on `DATABASE_URL`.

## Supabase provisioning checklist

The project expects the following to exist in the Supabase dashboard:

1. **Auth** — email provider on. For production, add your deployed domain(s)
   (Vercel production + preview URLs) to **Authentication → URL Configuration**
   (Site URL and Redirect URLs) so confirmation/recovery links work.
2. **Realtime** — `public.notifications` must be in the realtime publication:

   ```sql
   select * from pg_publication_tables where pubname = 'supabase_realtime';
   -- if missing:
   alter publication supabase_realtime add table public.notifications;
   ```

   Clients subscribe with `recipient_id=eq.<auth.uid()>`, so RLS decides who
   receives events — no data leaves the row owner's session.
3. **Storage buckets** — `avatars`, `covers`, `post-media`, `moment-media`
   (public read; authenticated users may upload only into their own
   `<auth.uid()>/…` folder).

## Deploying to Vercel

1. Push this repository to GitHub (secrets excluded — see `.gitignore`).
2. Import the repo into Vercel. The build command (`bun run build`) generates
   the correct Prisma client automatically.
3. Set the environment variables (from the table above) for
   Production + Preview:
   - `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`
   - `DATABASE_URL` → Supabase **pooled** connection string
4. Provision the database once, from your machine:

   ```bash
   # with DATABASE_URL + DIRECT_DATABASE_URL pointing at Supabase:
   bun run db:push:postgres
   ```

   > If the Supabase project already contains tables (e.g. `profiles`, `notifications`
   > created with their own RLS), prefer a dedicated Postgres schema for the app
   > tables by appending `?schema=kivo` to the connection string, so Prisma never
   > touches the Supabase-managed tables.
5. Add the Vercel domain(s) to Supabase Auth → URL Configuration.
6. Redeploy.

## Scripts

| Script                       | Purpose                                             |
| ---------------------------- | --------------------------------------------------- |
| `bun run dev`                | Start the dev server                                |
| `bun run build`              | Prisma generate (schema auto-picked) + `next build` |
| `bun run build:standalone`   | Self-hosted standalone build (`bun run start`)      |
| `bun run lint`               | ESLint                                              |
| `bun run db:push`            | Push schema to the local SQLite database            |
| `bun run db:push:postgres`   | Push schema to Supabase Postgres (one-time)         |

## Security notes

- Only the Supabase **publishable** key is ever used — client, server, everywhere.
- Supabase RLS (and storage policies) are the real authorization layer; the
  app never relies on client-side checks and never uses the service-role key.
- Realtime notification fan-out inserts run under the **acting user's** access
  token (verified server-side), so inserts are subject to RLS too.
- Sessions: Supabase sessions persist via the official SDK; the app's own
  session cookie is `httpOnly`, `SameSite=Lax`, and `Secure` in production.
- Error responses are friendly envelopes — SQL errors, stack traces, and
  internal details never reach the client.
