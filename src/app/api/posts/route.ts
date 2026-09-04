import { ok, requireUser, route, HttpError, parseBody } from "@/lib/api-helpers";
import { db } from "@/lib/db";
import { notify } from "@/lib/notify";
import {
  buildFollowSets,
  extractMentions,
  mapPost,
  postInclude,
  syncPostHashtags,
} from "@/services/posts-service";
import { createPostSchema } from "@/lib/validation";
import { fetchLinkMetadata } from "@/features/posts/server/link-meta";

/**
 * POST /api/posts — create a post (optionally with media, poll, link preview,
 * feeling, space target). Returns the mapped PostDTO.
 */
export const POST = route(async ({ req, user }) => {
  const authed = requireUser(user);
  const body = await parseBody(req, createPostSchema);

  const hasSomething =
    body.content.length > 0 ||
    body.media.length > 0 ||
    !!body.linkUrl ||
    !!body.poll;
  if (!hasSomething) {
    throw new HttpError(
      "VALIDATION",
      "Add something to your post — text, a photo, a link or a poll.",
    );
  }

  // Space target: must exist and the author must be a member.
  let space: { id: string; name: string } | null = null;
  if (body.spaceId) {
    const spaceRow = await db.space.findUnique({
      where: { id: body.spaceId },
      select: { id: true, name: true, members: { where: { userId: authed.id }, select: { id: true } } },
    });
    if (!spaceRow) throw new HttpError("NOT_FOUND", "That space doesn't exist.");
    if (spaceRow.members.length === 0) {
      throw new HttpError("FORBIDDEN", "Join this space before posting in it.");
    }
    space = { id: spaceRow.id, name: spaceRow.name };
  }

  // Server-side link metadata (best effort, never blocks creation for long).
  let linkMeta: { title: string | null; description: string | null; image: string | null } | null = null;
  if (body.linkUrl) {
    linkMeta = await fetchLinkMetadata(body.linkUrl);
  }

  const created = await db.$transaction(async (tx) => {
    const post = await tx.post.create({
      data: {
        authorId: authed.id,
        content: body.content,
        privacy: body.privacy,
        feeling: body.feeling ?? null,
        linkUrl: body.linkUrl ?? null,
        linkTitle: linkMeta?.title ?? null,
        linkDescription: linkMeta?.description ?? null,
        linkImage: linkMeta?.image ?? null,
        spaceId: body.spaceId ?? null,
      },
    });

    if (body.media.length > 0) {
      await tx.postMedia.createMany({
        data: body.media.map((m, index) => ({
          postId: post.id,
          url: m.url,
          type: m.type,
          width: m.width ?? null,
          height: m.height ?? null,
          position: index,
        })),
      });
    }

    if (body.poll) {
      await tx.poll.create({
        data: {
          postId: post.id,
          options: {
            create: body.poll.options.map((text, index) => ({ text, position: index })),
          },
        },
      });
    }

    return post;
  });

  await syncPostHashtags(created.id, body.content);

  // Mentions → notify mentioned users (excluding self).
  const mentionNames = extractMentions(body.content);
  if (mentionNames.length > 0) {
    const mentioned = await db.profile.findMany({
      where: { username: { in: mentionNames } },
      select: { userId: true },
    });
    await Promise.all(
      mentioned.map((p) =>
        notify({
          userId: p.userId,
          actorId: authed.id,
          type: "mention",
          postId: created.id,
          preview: body.content,
        }),
      ),
    );
  }

  // Space post → notify all members except the author.
  if (space) {
    const members = await db.spaceMember.findMany({
      where: { spaceId: space.id },
      select: { userId: true },
    });
    await Promise.all(
      members
        .filter((m) => m.userId !== authed.id)
        .map((m) =>
          notify({
            userId: m.userId,
            actorId: authed.id,
            type: "space_post",
            postId: created.id,
            spaceId: space.id,
            spaceName: space.name,
            postPreview: body.content,
          }),
        ),
    );
  }

  const [row, { followingSet }] = await Promise.all([
    db.post.findUnique({ where: { id: created.id }, include: postInclude }),
    buildFollowSets(authed.id),
  ]);
  if (!row) throw new HttpError("INTERNAL", "The post couldn't be loaded after creation.");
  return ok(mapPost(row, authed.id, followingSet));
});
