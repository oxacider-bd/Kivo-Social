import { db } from "@/lib/db";
import { HttpError, getCursorFrom, getLimitFrom, ok, requireUser, route } from "@/lib/api-helpers";
import { caseVariants, mapSpace, matchesAny, pageFromCandidates, spaceSearchInclude } from "../_shared";

/**
 * GET /api/search/spaces?q=&cursor= → Page<SpaceDTO>
 * Name or description contains (case-insensitive via JS filter),
 * ranked by member count then name.
 */
export const GET = route(async ({ req, user }) => {
  const viewer = requireUser(user);
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  if (!q) throw new HttpError("VALIDATION", "Type something to search.");

  const qLower = q.toLowerCase();
  const variants = caseVariants(q);
  const cursor = getCursorFrom(req);
  const limit = getLimitFrom(req, 10, 30);

  const rows = await db.space.findMany({
    where: {
      OR: variants.flatMap((v) => [{ name: { contains: v } }, { description: { contains: v } }]),
    },
    include: spaceSearchInclude(viewer.id),
    take: 100,
  });

  const matched = rows
    .filter((s) => matchesAny([s.name, s.description], qLower))
    .sort(
      (a, b) =>
        b._count.members - a._count.members || a.name.localeCompare(b.name),
    );

  const page = pageFromCandidates(matched, cursor, limit);

  return ok({ items: page.items.map(mapSpace), nextCursor: page.nextCursor });
});
