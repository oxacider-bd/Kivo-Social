import {
  HttpError,
  ok,
  parseBody,
  requireUser,
  route,
} from "@/lib/api-helpers";
import { db } from "@/lib/db";
import { buildFollowSets, mapPost, postInclude, syncPostHashtags } from "@/services/posts-service";
import { updatePostSchema } from "@/lib/validation";
import { requireOwnedPost, requireVisiblePost } from "@/features/posts/server/post-guard";

// ─── GET /api/posts/:id → PostDTO (visibility enforced) ─────────────────────

export const GET = route<{ id: string }>(async ({ user, params }) => {
  const authed = requireUser(user);
  const post = await requireVisiblePost(params.id, authed.id);
  const { followingSet } = await buildFollowSets(authed.id);
  return ok(mapPost(post, authed.id, followingSet));
});

// ─── PATCH /api/posts/:id → PostDTO (owner only) ────────────────────────────

export const PATCH = route<{ id: string }>(async ({ req, user, params }) => {
  const authed = requireUser(user);
  const body = await parseBody(req, updatePostSchema);
  await requireOwnedPost(params.id, authed.id);

  await db.post.update({
    where: { id: params.id },
    data: {
      ...(body.content !== undefined ? { content: body.content } : {}),
      ...(body.privacy !== undefined ? { privacy: body.privacy } : {}),
    },
  });

  if (body.content !== undefined) {
    await syncPostHashtags(params.id, body.content);
  }

  const [row, { followingSet }] = await Promise.all([
    db.post.findUnique({ where: { id: params.id }, include: postInclude }),
    buildFollowSets(authed.id),
  ]);
  if (!row) throw new HttpError("NOT_FOUND");
  return ok(mapPost(row, authed.id, followingSet));
});

// ─── DELETE /api/posts/:id → { deleted: true } (owner only) ─────────────────

export const DELETE = route<{ id: string }>(async ({ user, params }) => {
  const authed = requireUser(user);
  await requireOwnedPost(params.id, authed.id);
  // Media / reactions / comments / poll / savedPosts / postHashtags cascade in schema.
  await db.post.delete({ where: { id: params.id } });
  return ok({ deleted: true });
});
