import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import type {
  CommentDTO,
  Page,
  PollDTO,
  PostDTO,
  Privacy,
  ProfileCardDTO,
  ReactionType,
} from "@/types";

// ─── Visibility rules (server-enforced, RLS-equivalent) ─────────────────────

export async function getFollowingIds(viewerId: string) {
  const rows = await db.follow.findMany({
    where: { followerId: viewerId },
    select: { followingId: true },
  });
  return rows.map((r) => r.followingId);
}

/**
 * Prisma WHERE clause for posts visible to `viewerId` on the global feed.
 * Rules:
 *  - own posts: always
 *  - public posts of public-profile authors: everyone
 *  - posts (non-ONLY_ME) of authors the viewer follows (covers private profiles)
 */
export async function visibleFeedWhere(viewerId: string) {
  const followingIds = await getFollowingIds(viewerId);
  return {
    OR: [
      { authorId: viewerId },
      { privacy: "PUBLIC", author: { profile: { isPrivate: false } } },
      { authorId: { in: followingIds }, privacy: { not: "ONLY_ME" } },
    ],
  } satisfies Prisma.PostWhereInput;
}

/**
 * WHERE for posts visible on a specific profile.
 */
export function visibleProfilePostsWhere(
  viewerId: string | null,
  authorId: string,
  isSelf: boolean,
  isFollower: boolean,
) {
  if (isSelf) return { authorId };
  if (isFollower) return { authorId, privacy: { not: "ONLY_ME" } };
  return { authorId, privacy: "PUBLIC" };
}

// ─── DTO mappers ─────────────────────────────────────────────────────────────

export function mapProfileCard(
  profile: {
    id: string;
    userId: string;
    username: string;
    fullName: string;
    bio: string;
    avatarUrl: string | null;
    isPrivate: boolean;
    mood: string;
  },
  viewerId: string | null,
  followSet: Set<string> | null, // ids the viewer follows
  followerSet: Set<string> | null, // ids that follow the viewer
): ProfileCardDTO {
  const isSelf = viewerId === profile.userId;
  return {
    id: profile.id,
    userId: profile.userId,
    username: profile.username,
    fullName: profile.fullName,
    avatarUrl: profile.avatarUrl,
    bio: profile.bio,
    isPrivate: profile.isPrivate,
    mood: profile.mood,
    viewer: {
      isSelf,
      isFollowing: !isSelf && !!followSet?.has(profile.userId),
      isRequested: false,
      followsViewer: !isSelf && !!followerSet?.has(profile.userId),
    },
  };
}

/** Builds the sets needed for mapping cards of many authors in one go. */
export async function buildFollowSets(viewerId: string | null) {
  if (!viewerId) return { followingSet: new Set<string>(), followerSet: new Set<string>() };
  const [following, followers] = await Promise.all([
    db.follow.findMany({ where: { followerId: viewerId }, select: { followingId: true } }),
    db.follow.findMany({ where: { followingId: viewerId }, select: { followerId: true } }),
  ]);
  return {
    followingSet: new Set(following.map((f) => f.followingId)),
    followerSet: new Set(followers.map((f) => f.followerId)),
  };
}

type PostWithRelations = Prisma.PostGetPayload<{
  include: {
    author: { include: { profile: true } };
    media: true;
    reactions: true;
    comments: { select: { id: true, parentId: true } };
    savedBy: { select: { userId: true } };
    poll: { include: { options: { include: { votes: { select: { userId: true } } } } } };
    space: { select: { id: true, slug: true, name: true } };
  };
}>;

export function mapPost(
  post: PostWithRelations,
  viewerId: string | null,
  followingSet: Set<string>,
): PostDTO {
  const authorProfile = post.author.profile;
  if (!authorProfile) throw new Error("Post author profile missing");
  const reactionCounts = new Map<string, number>();
  for (const r of post.reactions) {
    reactionCounts.set(r.type, (reactionCounts.get(r.type) ?? 0) + 1);
  }
  const topReactions = [...reactionCounts.entries()]
    .map(([type, count]) => ({ type: type as ReactionType, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);
  const viewerReaction = viewerId
    ? (post.reactions.find((r) => r.userId === viewerId)?.type ?? null) as ReactionType | null
    : null;

  let poll: PollDTO | null = null;
  if (post.poll) {
    const options = [...post.poll.options]
      .sort((a, b) => a.position - b.position)
      .map((o) => ({
        id: o.id,
        text: o.text,
        voteCount: o.votes.length,
        votedByViewer: viewerId ? o.votes.some((v) => v.userId === viewerId) : false,
      }));
    poll = {
      id: post.poll.id,
      options,
      totalVotes: options.reduce((s, o) => s + o.voteCount, 0),
      endsAt: post.poll.endsAt?.toISOString() ?? null,
    };
  }

  return {
    id: post.id,
    content: post.content,
    privacy: post.privacy as Privacy,
    feeling: post.feeling,
    link:
      post.linkUrl != null
        ? {
            url: post.linkUrl,
            title: post.linkTitle,
            description: post.linkDescription,
            image: post.linkImage,
          }
        : null,
    author: {
      id: authorProfile.id,
      userId: authorProfile.userId,
      username: authorProfile.username,
      fullName: authorProfile.fullName,
      avatarUrl: authorProfile.avatarUrl,
      bio: authorProfile.bio,
      isPrivate: authorProfile.isPrivate,
      mood: authorProfile.mood,
      viewer: {
        isSelf: viewerId === authorProfile.userId,
        isFollowing: viewerId !== authorProfile.userId && followingSet.has(authorProfile.userId),
        isRequested: false,
        followsViewer: false,
      },
    },
    media: post.media
      .sort((a, b) => a.position - b.position)
      .map((m) => ({ id: m.id, url: m.url, type: m.type as "image" | "video", width: m.width, height: m.height })),
    poll,
    counts: {
      reactions: post.reactions.length,
      comments: post.comments.filter((c) => !c.parentId).length,
    },
    topReactions,
    viewerReaction,
    viewerSaved: viewerId ? post.savedBy.some((s) => s.userId === viewerId) : false,
    space: post.space ?? null,
    createdAt: post.createdAt.toISOString(),
    updatedAt: post.updatedAt.toISOString(),
  };
}

export async function mapPosts(
  posts: PostWithRelations[],
  viewerId: string | null,
): Promise<PostDTO[]> {
  const { followingSet } = await buildFollowSets(viewerId);
  return posts.map((p) => mapPost(p, viewerId, followingSet));
}

export const postInclude = {
  author: { include: { profile: true } },
  media: true,
  reactions: true,
  comments: { select: { id: true, parentId: true } },
  savedBy: { select: { userId: true } },
  poll: { include: { options: { include: { votes: { select: { userId: true } } } } } },
  space: { select: { id: true, slug: true, name: true } },
} satisfies Prisma.PostInclude;

// ─── Comments ────────────────────────────────────────────────────────────────

type CommentWithRelations = Prisma.CommentGetPayload<{
  include: { author: { include: { profile: true } }; reactions: true; replies: true };
}>;

export function mapComment(
  comment: CommentWithRelations,
  viewerId: string | null,
): CommentDTO {
  const summary = new Map<string, { count: number; viewerReacted: boolean }>();
  for (const r of comment.reactions) {
    const entry = summary.get(r.type) ?? { count: 0, viewerReacted: false };
    entry.count += 1;
    if (viewerId && r.userId === viewerId) entry.viewerReacted = true;
    summary.set(r.type, entry);
  }
  const authorProfile = comment.author.profile;
  if (!authorProfile) throw new Error("Comment author profile missing");
  return {
    id: comment.id,
    postId: comment.postId,
    parentId: comment.parentId,
    content: comment.content,
    author: {
      id: authorProfile.id,
      userId: authorProfile.userId,
      username: authorProfile.username,
      fullName: authorProfile.fullName,
      avatarUrl: authorProfile.avatarUrl,
      bio: authorProfile.bio,
      isPrivate: authorProfile.isPrivate,
      mood: authorProfile.mood,
      viewer: {
        isSelf: viewerId === authorProfile.userId,
        isFollowing: false,
        isRequested: false,
        followsViewer: false,
      },
    },
    replyCount: comment.replies.length,
    reactionSummary: [...summary.entries()]
      .map(([type, v]) => ({ type: type as ReactionType, ...v }))
      .sort((a, b) => b.count - a.count),
    viewer: { canEdit: viewerId === authorProfile.userId },
    createdAt: comment.createdAt.toISOString(),
    updatedAt: comment.updatedAt.toISOString(),
  };
}

export const commentInclude = {
  author: { include: { profile: true } },
  reactions: true,
  replies: { where: { deletedAt: null }, select: { id: true } },
} satisfies Prisma.CommentInclude;

// ─── Hashtags ────────────────────────────────────────────────────────────────

export async function syncPostHashtags(postId: string, content: string) {
  const tags = extractHashtags(content);
  await db.postHashtag.deleteMany({ where: { postId } });
  for (const tag of tags) {
    const hashtag = await db.hashtag.upsert({
      where: { tag },
      update: {},
      create: { tag },
    });
    await db.postHashtag.create({ data: { postId, hashtagId: hashtag.id } }).catch(() => {
      // duplicate (same tag twice in content) — ignore
    });
  }
}

export function extractHashtags(content: string): string[] {
  const matches = content.matchAll(/#([a-zA-Z0-9_]{1,40})/g);
  const tags = new Set<string>();
  for (const m of matches) tags.add(m[1].toLowerCase());
  return [...tags].slice(0, 10);
}

export function extractMentions(content: string): string[] {
  const matches = content.matchAll(/@([a-zA-Z0-9_]{3,20})/g);
  const names = new Set<string>();
  for (const m of matches) names.add(m[1].toLowerCase());
  return [...names].slice(0, 10);
}

// ─── Pagination helper for already-mapped DTOs ───────────────────────────────

export function toPage<T>(items: T[], nextCursor: string | null): Page<T> {
  return { items, nextCursor };
}
