import { db } from "@/lib/db";
import { HttpError, ok, parseBody, requireUser, route } from "@/lib/api-helpers";
import { updateSpaceSchema } from "@/lib/validation";
import { mapSpace, requireSpace } from "@/features/spaces/server/space-mapper";

// GET /api/spaces/:slug → SpaceDTO.
export const GET = route<{ slug: string }>(async ({ params, user }) => {
  const authed = requireUser(user);
  const space = await requireSpace(params.slug);
  const membership = await db.spaceMember.findUnique({
    where: { spaceId_userId: { spaceId: space.id, userId: authed.id } },
    select: { role: true },
  });
  return ok(mapSpace(space, membership));
});

// PATCH /api/spaces/:slug → SpaceDTO — OWNER only.
export const PATCH = route<{ slug: string }>(async ({ params, req, user }) => {
  const authed = requireUser(user);
  const space = await requireSpace(params.slug);
  const membership = await db.spaceMember.findUnique({
    where: { spaceId_userId: { spaceId: space.id, userId: authed.id } },
    select: { role: true },
  });
  if (!membership || membership.role !== "OWNER") {
    throw new HttpError("FORBIDDEN", "Only the space owner can edit it.");
  }

  const input = await parseBody(req, updateSpaceSchema);
  const updated = await db.space.update({
    where: { id: space.id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.rules !== undefined ? { rules: input.rules } : {}),
      ...(input.announcement !== undefined ? { announcement: input.announcement } : {}),
      ...(input.avatarUrl !== undefined ? { avatarUrl: input.avatarUrl } : {}),
      ...(input.coverUrl !== undefined ? { coverUrl: input.coverUrl } : {}),
    },
    include: { _count: { select: { members: true, posts: true } } },
  });
  return ok(mapSpace(updated, membership));
});
