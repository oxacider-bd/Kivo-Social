import type { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { createSession, generateToken, hashPassword } from "@/lib/auth";
import { fail, ok, parseBody, route } from "@/lib/api-helpers";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { toSessionDTO } from "@/lib/dto";
import { createSupabaseServerClient, isSupabaseConfigured } from "@/lib/supabase";

export const POST = route(async ({ req }: { req: NextRequest }) => {
  if (!rateLimit(`supabase-bridge:${clientIp(req)}`, 20, 60_000)) return fail("RATE_LIMITED");
  const body = await parseBody(req, z.object({ accessToken: z.string().min(10) }));

  // If Supabase is not configured, skip the bridge and return 401
  // so the client falls back to legacy session.
  if (!isSupabaseConfigured()) {
    return fail("UNAUTHORIZED", "Supabase not configured. Please sign in again.", 401);
  }

  // 1) Supabase itself validates the access token — the client-supplied
  //    token is never trusted on its own, and identity is derived from the
  //    verified result, never from a client-supplied user id.
  let supabaseUser: any = null;
  let email: string | null = null;

  try {
    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase.auth.getUser(body.accessToken);
    supabaseUser = data.user;
    email = supabaseUser?.email?.toLowerCase() ?? null;
    if (error || !supabaseUser || !email) {
      return fail("UNAUTHORIZED", "Your session could not be verified. Please sign in again.", 401);
    }
  } catch (err) {
    console.error("[bridge] Supabase verification failed:", err);
    return fail("UNAUTHORIZED", "Session verification failed. Please sign in again.", 401);
  }

  // 2) Find the app account for this identity, or provision a mirror the
  //    first time a Supabase user signs in. The mirror exists purely so the
  //    app's existing backend features keep working; the identity shown in
  //    the UI comes from Supabase `profiles` (created by the DB trigger —
  //    we never insert into `profiles` here).
  let user = await db.user.findUnique({
    where: { email },
    include: { profile: true },
  });

  if (!user) {
    const meta = (supabaseUser.user_metadata ?? {}) as Record<string, unknown>;
    const rawName = typeof meta.full_name === "string" ? meta.full_name.trim() : "";
    const fullName = (rawName || "KIVO user").slice(0, 50);
    const base = sanitizeUsername(
      typeof meta.username === "string" && meta.username ? meta.username : (email.split("@")[0] ?? "")
    );

    let username = base;
    for (let attempt = 1; attempt <= 8; attempt++) {
      const taken = await db.profile.findUnique({ where: { username }, select: { id: true } });
      if (!taken) break;
      username = `${base.slice(0, 18)}${attempt + 1}`;
    }

    // Unusable random password — Supabase Auth owns credentials; this
    // account can never be signed into through the legacy path.
    const passwordHash = await hashPassword(`${generateToken()}${generateToken()}`);
    user = await db.user.create({
      data: {
        email,
        passwordHash,
        supabaseId: supabaseUser.id,
        profile: { create: { username, fullName } },
      },
      include: { profile: true },
    });
  } else if (user.supabaseId !== supabaseUser.id) {
    // Link the verified Supabase identity (used for realtime notification
    // delivery). Unique conflicts are non-fatal — the mirror still works.
    try {
      user = await db.user.update({
        where: { id: user.id },
        data: { supabaseId: supabaseUser.id },
        include: { profile: true },
      });
    } catch {
      /* keep the unlinked mirror */
    }
  }

  // 3) Establish the app session cookie so every existing API keeps working.
  await createSession(user.id);
  return ok(toSessionDTO(user));
});

/** Normalize to the app's username rules: ^[a-z0-9_]{3,20}$ */
function sanitizeUsername(input: string): string {
  let u = input
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 20);
  if (u.length < 3) u = `user${u}`;
  return u || `user${Date.now().toString(36).slice(-6)}`;
}
