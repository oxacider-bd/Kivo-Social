import {
  getCursorFrom,
  getLimitFrom,
  makePage,
  HttpError,
  ok,
  parseBody,
  requireUser,
  route,
} from "@/lib/api-helpers";
import { db } from "@/lib/db";
import { notify } from "@/lib/notify";
import {
  commentInclude,
  extractMentions,
  mapComment,
} from "@/services/posts-service";
import { commentSchema } from "@/lib/validation";
import { requireVisiblePost } from "@/features/posts/server/post-guard";
import type { Page, CommentDTO } from "@/types";

// ─── GET /api/posts/:id/comments → Page<CommentDTO> ─────────────────────────
// Top-level comments only, newest first, cursor paginated. Soft-deleted
// comments are kept (content is cleared) so reply threads stay anchored.

export const GET = route<{ id: string }>(async ({ req, user, params }) => {
  const authed = requireUser(user);
  await requireVisiblePost(params.id, authed.id);
  const limit = getLimitFrom(req, 10, 30);
  const cursor = getCursorFrom(req);

  const rows = await db.comment.findMany({
    where: {
      postId: params.id,
      parentId: null,
      ...(cursor
        ? {
            OR: [
              { createdAt: { lt: cursor.createdAt } },
              { AND: [{ createdAt: cursor.createdAt }, { id: { lt: cursor.id } }] },
            ],
          }
        : {}),
    },
    include: commentInclude,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
  });

  const rawPage = makePage(rows, limit);
  const page: Page<CommentDTO> = {
    items: rawPage.items.map((c) => mapComment(c as MappableComment, authed.id)),
    nextCursor: rawPage.nextCursor,
  };
  return ok(page);
});

/** mapComment's structural type keeps full reply rows; commentInclude selects ids only. */
type MappableComment = Parameters<typeof mapComment>[0];

// ─── POST /api/posts/:id/comments → CommentDTO ──────────────────────────────

export const POST = route<{ id: string }>(async ({ req, user, params }) => {
  const authed = requireUser(user);
  const body = await parseBody(req, commentSchema);
  const post = await requireVisiblePost(params.id, authed.id);

  // Replies stay one level deep: replying to a reply flattens to its parent.
  let parentId: string | null = null;
  let parentAuthorId: string | null = null;
  if (body.parentId) {
    const parent = await db.comment.findUnique({
      where: { id: body.parentId },
      select: { id: true, postId: true, parentId: true, authorId: true, deletedAt: true },
    });
    if (!parent || parent.postId !== params.id || parent.deletedAt) {
      throw new HttpError("VALIDATION", "That comment no longer exists.");
    }
    parentId = parent.parentId ?? parent.id;
    parentAuthorId = parent.authorId;
  }

  const created = await db.comment.create({
    data: {
      postId: params.id,
      authorId: authed.id,
      parentId,
      content: body.content,
    },
    include: commentInclude,
  });

  // Notifications: post author for top-level comments, parent author for
  // replies, plus anyone @mentioned. Self + duplicates are skipped.
  const notified = new Set<string>([authed.id]);
  const snippet = body.content;
  if (parentAuthorId) {
    if (!notified.has(parentAuthorId)) {
      notified.add(parentAuthorId);
      await notify({
        userId: parentAuthorId,
        actorId: authed.id,
        type: "reply",
        postId: params.id,
        commentId: created.id,
        postPreview: post.content,
        preview: snippet,
      });
    }
  } else if (!notified.has(post.authorId)) {
    notified.add(post.authorId);
    await notify({
      userId: post.authorId,
      actorId: authed.id,
      type: "comment",
      postId: params.id,
      commentId: created.id,
      postPreview: post.content,
      preview: snippet,
    });
  }

  const mentionNames = extractMentions(body.content);
  if (mentionNames.length > 0) {
    const mentioned = await db.profile.findMany({
      where: { username: { in: mentionNames } },
      select: { userId: true },
    });
    for (const profile of mentioned) {
      if (notified.has(profile.userId)) continue;
      notified.add(profile.userId);
      await notify({
        userId: profile.userId,
        actorId: authed.id,
        type: "mention",
        postId: params.id,
        commentId: created.id,
        postPreview: post.content,
        preview: snippet,
      });
    }
  }

  return ok(mapComment(created as MappableComment, authed.id));
});
