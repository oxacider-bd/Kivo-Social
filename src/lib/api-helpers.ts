import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { ZodError, ZodSchema } from "zod";
import { getSessionUser, type AuthedUser } from "@/lib/auth";
import { runWithRequestContext } from "@/lib/request-context";
// ─── Response envelope ───────────────────────────────────────────────────────

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json({ ok: true, data }, init);
}

export function fail(code: string, message?: string, status?: number) {
  return NextResponse.json(
    { ok: false, error: { code, message: message ?? FRIENDLY_MESSAGES[code] ?? FRIENDLY_MESSAGES.INTERNAL } },
    { status: status ?? STATUS_BY_CODE[code] ?? 400 },
  );
}

/** Human-friendly messages — never leak raw DB errors to clients. */
const FRIENDLY_MESSAGES: Record<string, string> = {
  UNAUTHORIZED: "Please sign in to continue.",
  FORBIDDEN: "You don't have permission to do that.",
  NOT_FOUND: "We couldn't find that.",
  VALIDATION: "Some details need a quick fix.",
  RATE_LIMITED: "Slow down a little — try again in a moment.",
  CONFLICT: "That's already taken. Try another.",
  INTERNAL: "Something went wrong on our side. Please try again.",
};

export class HttpError extends Error {
  constructor(
    public code: keyof typeof FRIENDLY_MESSAGES | string,
    message?: string,
    public status?: number,
  ) {
    super(message ?? FRIENDLY_MESSAGES[code] ?? FRIENDLY_MESSAGES.INTERNAL);
  }
}

// ─── Route wrapper ───────────────────────────────────────────────────────────

type Handler<T> = (ctx: { req: NextRequest; user: AuthedUser | null; params: T }) => Promise<Response>;

export function route(handler: Handler<Record<string, never>>): (req: NextRequest) => Promise<Response>;
export function route<T extends { [k: string]: string }>(
  handler: Handler<T>,
): (req: NextRequest, ctx: { params: Promise<T> }) => Promise<Response>;
export function route(handler: Handler<never>) {
  return async (req: NextRequest, ctx?: { params: Promise<unknown> }) => {
    try {
      const user = await getSessionUser();
      const params = (ctx?.params ? await ctx.params : {}) as never;
      // Capture the (optional) forwarded Supabase identity for this request so
      // server helpers (e.g. realtime fan-out) can act under RLS as the user.
      return await runWithRequestContext(
        { authorization: req.headers.get("authorization"), origin: req.nextUrl.origin },
        () => handler({ req, user, params }),
      );
    } catch (err) {
      return errorResponse(err);
    }
  };
}

export function errorResponse(err: unknown) {
  if (err instanceof HttpError) {
    const status = err.status ?? STATUS_BY_CODE[err.code] ?? 400;
    return fail(err.code, err.message, status);
  }
  if (err instanceof ZodError) {
    const first = err.issues[0];
    return fail("VALIDATION", first?.message ?? FRIENDLY_MESSAGES.VALIDATION, 422);
  }
  // Database-layer failures surface their SAFE error class (Prisma P-code +
  // scrubbed detail) so production outages are diagnosable — credentials and
  // stack traces are never included.
  const prismaCode = (err as { code?: unknown })?.code;
  const prismaName = (err as { name?: unknown })?.name;
  const isPrisma =
    (typeof prismaCode === "string" && /^P\d{4,5}$/.test(prismaCode)) ||
    prismaName === "PrismaClientInitializationError" ||
    prismaName === "PrismaClientKnownRequestError";
  if (isPrisma) {
    console.error("[api] database error:", err);
    const detail = String((err as { message?: unknown }).message ?? "")
      .split("\n")
      .slice(0, 3)
      .join(" ")
      .replace(/:\/\/[^@\s]+@/g, "://***@")
      .slice(0, 240);
    return NextResponse.json(
      {
        ok: false,
        error: { code: "INTERNAL", message: FRIENDLY_MESSAGES.INTERNAL },
        diag: { prismaCode: typeof prismaCode === "string" ? prismaCode : prismaName ?? "PRISMA_ERROR", detail },
      },
      { status: 500 },
    );
  }
  console.error("[api] unhandled error:", err);
  return fail("INTERNAL", undefined, 500);
}

const STATUS_BY_CODE: Record<string, number> = {
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION: 422,
  RATE_LIMITED: 429,
  CONFLICT: 409,
  INTERNAL: 500,
};

// ─── Auth guards ─────────────────────────────────────────────────────────────

export function requireUser(user: AuthedUser | null): AuthedUser {
  if (!user) throw new HttpError("UNAUTHORIZED");
  return user;
}

// ─── Body parsing ────────────────────────────────────────────────────────────

export async function parseBody<T>(req: NextRequest, schema: ZodSchema<T>): Promise<T> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    throw new HttpError("VALIDATION", "Invalid request body.");
  }
  return schema.parse(json);
}

// ─── Cursor pagination (createdAt-based, opaque base64 cursor) ──────────────

export function encodeCursor(date: Date, id: string) {
  return Buffer.from(`${date.toISOString()}|${id}`).toString("base64url");
}

export function decodeCursor(cursor: string): { createdAt: Date; id: string } | null {
  try {
    const [iso, id] = Buffer.from(cursor, "base64url").toString("utf-8").split("|");
    if (!iso || !id) return null;
    const createdAt = new Date(iso);
    if (isNaN(createdAt.getTime())) return null;
    return { createdAt, id };
  } catch {
    return null;
  }
}

export function getCursorFrom(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("cursor");
  if (!raw) return null;
  return decodeCursor(raw);
}

export function getLimitFrom(req: NextRequest, fallback = 10, max = 30) {
  const n = Number(req.nextUrl.searchParams.get("limit"));
  if (!n || !isFinite(n)) return fallback;
  return Math.min(Math.max(Math.floor(n), 1), max);
}

export function makePage<T extends { createdAt: Date; id: string }>(rows: T[], limit: number) {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const last = items[items.length - 1];
  return {
    items,
    nextCursor: hasMore && last ? encodeCursor(last.createdAt, last.id) : null,
  };
}
