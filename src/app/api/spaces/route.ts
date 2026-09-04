import { db } from "@/lib/db";
import {
  getCursorFrom,
  getLimitFrom,
  HttpError,
  makePage,
  ok,
  parseBody,
  requireUser,
  route,
} from "@/lib/api-helpers";
import { createSpaceSchema } from "@/lib/validation";
import {
  getViewerMemberships,
  mapSpace,
  slugify,
  uniqueSlug,
} from "@/features/spaces/server/space-mapper";
import type { Prisma } from "@prisma/client";
import type { Page, SpaceDTO } from "@/types";

// GET /api/spaces?q&tab=discover|my&cursor → Page<SpaceDTO> (limit 12).
export const GET = route(async ({ req, user }) => {
  const authed = requireUser(user);
  const tab = req.nextUrl.searchParams.get("tab") === "my" ? "my" : "discover";
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim().toLowerCase();
  const cursor = getCursorFrom(req);
  const limit = getLimitFrom(req, 12, 30);

  const where: Prisma.SpaceWhereInput = {};
  if (tab === "my") where.members = { some: { userId: authed.id } };
  if (cursor) {
    // Newest-first chronological cursor (page ordering is refined in JS below).
    where.AND = [
      {
        OR: [
          { createdAt: { lt: cursor.createdAt } },
          { createdAt: cursor.createdAt, id: { lt: cursor.id } },
        ],
      },
    ];
  }

  // Discover pages can re-sort/filter in JS, so overfetch candidates a bit.
  const take = tab === "discover" && q ? limit * 6 + 1 : limit + 1;
  const rows = await db.space.findMany({
    where,
    include: { _count: { select: { members: true, posts: true } } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take,
  });

  let candidates = rows;
  if (q) {
    candidates = candidates.filter(
      (s) =>
        s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q),
    );
  }
  if (tab === "discover") {
    candidates = [...candidates].sort(
      (a, b) =>
        b._count.members - a._count.members ||
        b._count.posts - a._count.posts ||
        b.createdAt.getTime() - a.createdAt.getTime(),
    );
  }

  const page = makePage(candidates, limit);
  const memberships = await getViewerMemberships(authed.id);
  const items: SpaceDTO[] = page.items.map((s) =>
    mapSpace(s, memberships.get(s.id)),
  );
  const result: Page<SpaceDTO> = { items, nextCursor: page.nextCursor };
  return ok(result);
});

// POST /api/spaces → SpaceDTO — creates a space; creator becomes OWNER.
export const POST = route(async ({ req, user }) => {
  const authed = requireUser(user);
  const input = await parseBody(req, createSpaceSchema);

  const base = slugify(input.name);
  const slug = await uniqueSlug(base);

  const space = await db.space.create({
    data: {
      slug,
      name: input.name,
      description: input.description,
      avatarUrl: input.avatarUrl ?? null,
      coverUrl: input.coverUrl ?? null,
      createdById: authed.id,
      members: { create: { userId: authed.id, role: "OWNER" } },
    },
    include: { _count: { select: { members: true, posts: true } } },
  });

  if (!space) throw new HttpError("INTERNAL", "The space couldn't be created.");
  return ok(mapSpace(space, { role: "OWNER" }), { status: 201 });
});
