import { db } from "@/lib/db";
import { ok, requireUser, route } from "@/lib/api-helpers";
import { requireSpace } from "@/features/spaces/server/space-mapper";

// POST /api/spaces/:slug/join → { isMember: true } — idempotent.
export const POST = route<{ slug: string }>(async ({ params, user }) => {
  const authed = requireUser(user);
  const space = await requireSpace(params.slug);
  await db.spaceMember.upsert({
    where: { spaceId_userId: { spaceId: space.id, userId: authed.id } },
    update: {},
    create: { spaceId: space.id, userId: authed.id, role: "MEMBER" },
  });
  return ok({ isMember: true });
});
