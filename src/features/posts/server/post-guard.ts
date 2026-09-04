import "server-only";
import { HttpError } from "@/lib/api-helpers";
import { db } from "@/lib/db";
import { postInclude } from "@/services/posts-service";

/**
 * Visibility gate shared by every post-scoped endpoint (details, comments,
 * reactions, votes, saves). Mirrors the feed rules:
 *  - own post → always visible
 *  - ONLY_ME → owner only (404 for everyone else, to avoid leaking existence)
 *  - FOLLOWERS → followers + self
 *  - PUBLIC → everyone, unless the author's profile is private → followers + self
 * Space posts stay readable by anyone who can read the post itself
 * (spaces are public-read).
 *
 * Throws NOT_FOUND for missing/invisible posts. Returns the full include row.
 */
export async function requireVisiblePost(postId: string, viewerId: string) {
  const post = await db.post.findUnique({
    where: { id: postId },
    include: postInclude,
  });
  if (!post || !post.author.profile) throw new HttpError("NOT_FOUND");

  if (post.authorId !== viewerId) {
    if (post.privacy === "ONLY_ME") throw new HttpError("NOT_FOUND");
    const needsFollow =
      post.privacy === "FOLLOWERS" || post.author.profile.isPrivate;
    if (needsFollow) {
      const follow = await db.follow.findUnique({
        where: {
          followerId_followingId: { followerId: viewerId, followingId: post.authorId },
        },
        select: { id: true },
      });
      if (!follow) throw new HttpError("NOT_FOUND");
    }
  }
  return post;
}

/** Lightweight variant that only checks existence + authorship (owner-only routes). */
export async function requireOwnedPost(postId: string, viewerId: string) {
  const post = await db.post.findUnique({
    where: { id: postId },
    select: { id: true, authorId: true },
  });
  if (!post) throw new HttpError("NOT_FOUND");
  if (post.authorId !== viewerId) throw new HttpError("FORBIDDEN");
  return post;
}
