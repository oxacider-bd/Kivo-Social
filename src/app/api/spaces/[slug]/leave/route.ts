import { db } from "@/lib/db";
import { HttpError, ok, requireUser, route } from "@/lib/api-helpers";
import { requireSpace } from "@/features/spaces/server/space-mapper";

// POST /api/spaces/:slug/leave → { isMember: false } — owners can't leave.
export const POST = route<{ slug: string }>(async ({ params, user }) => {
  const authed = requireUser(user);
  const space = await requireSpace(params.slug);
  const membership = await db.spaceMember.findUnique({
    where: { spaceId_userId: { spaceId: space.id, userId: authed.id } },
  });
  if (membership?.role === "OWNER") {
    throw new HttpError(
      "VALIDATION",
      "Transfer ownership first (not supported yet) — you created this space.",
    );
  }
  await db.spaceMember.deleteMany({
    where: { spaceId: space.id, userId: authed.id },
  });
  return ok({ isMember: false });
});
