// ─── KIVO shared domain types ────────────────────────────────────────────────
// Single source of truth for DTOs exchanged with the API.

export type Privacy = "PUBLIC" | "FOLLOWERS" | "ONLY_ME";
export type ReactionType = "LOVE" | "FUNNY" | "WOW" | "SAD" | "FIRE" | "SUPPORT";
export type MomentType = "text" | "image" | "video" | "poll";
export type SpaceRole = "OWNER" | "ADMIN" | "MEMBER";
export type NotificationType =
  | "reaction"
  | "comment"
  | "reply"
  | "follow"
  | "follow_request"
  | "follow_accept"
  | "mention"
  | "space_post";

// ─── Session / Profile ───────────────────────────────────────────────────────

export interface SessionUser {
  id: string;
  email: string;
  createdAt: string;
  profile: ProfileDTO;
}

export interface ProfileDTO {
  id: string;
  userId: string;
  username: string;
  fullName: string;
  bio: string;
  avatarUrl: string | null;
  coverUrl: string | null;
  mood: string;
  isPrivate: boolean;
  defaultPrivacy: Privacy;
  notificationPrefs: NotificationPrefs;
  createdAt: string;
}

export interface NotificationPrefs {
  reactions: boolean;
  comments: boolean;
  replies: boolean;
  follows: boolean;
  mentions: boolean;
  spaceActivity: boolean;
}

export interface ProfileDetailDTO extends ProfileDTO {
  counts: {
    posts: number;
    followers: number;
    following: number;
  };
  viewer: {
    isSelf: boolean;
    isFollowing: boolean;
    isRequested: boolean; // viewer sent a follow request (private target)
    followsViewer: boolean;
    canViewContent: boolean; // private target + not follower => false
  };
}

export interface ProfileCardDTO {
  id: string;
  userId: string;
  username: string;
  fullName: string;
  avatarUrl: string | null;
  bio: string;
  isPrivate: boolean;
  mood: string;
  viewer: {
    isSelf: boolean;
    isFollowing: boolean;
    isRequested: boolean;
    followsViewer: boolean;
  };
}

// ─── Posts ───────────────────────────────────────────────────────────────────

export interface PostMediaDTO {
  id: string;
  url: string;
  type: "image" | "video";
  width: number | null;
  height: number | null;
}

export interface LinkPreviewDTO {
  url: string;
  title: string | null;
  description: string | null;
  image: string | null;
}

export interface PollOptionDTO {
  id: string;
  text: string;
  voteCount: number;
  votedByViewer: boolean;
}

export interface PollDTO {
  id: string;
  options: PollOptionDTO[];
  totalVotes: number;
  endsAt: string | null;
}

export interface PostDTO {
  id: string;
  content: string;
  privacy: Privacy;
  feeling: string | null;
  link: LinkPreviewDTO | null;
  author: ProfileCardDTO;
  media: PostMediaDTO[];
  poll: PollDTO | null;
  counts: {
    reactions: number;
    comments: number;
  };
  topReactions: { type: ReactionType; count: number }[];
  viewerReaction: ReactionType | null;
  viewerSaved: boolean;
  space: { id: string; slug: string; name: string } | null;
  createdAt: string;
  updatedAt: string;
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

// ─── Comments / Threads ──────────────────────────────────────────────────────

export interface CommentReactionSummary {
  type: ReactionType;
  count: number;
  viewerReacted: boolean;
}

export interface CommentDTO {
  id: string;
  postId: string;
  parentId: string | null;
  content: string;
  author: ProfileCardDTO;
  replyCount: number;
  reactionSummary: CommentReactionSummary[];
  viewer: {
    canEdit: boolean;
  };
  createdAt: string;
  updatedAt: string;
}

// ─── Moments ─────────────────────────────────────────────────────────────────

export interface MomentDTO {
  id: string;
  type: MomentType;
  content: string;
  mediaUrl: string | null;
  mediaType: "image" | "video" | null;
  background: string | null;
  poll: PollDTO | null;
  expiresAt: string;
  createdAt: string;
  author: ProfileCardDTO;
  viewerSeen: boolean;
  viewCount?: number; // present for own moments
  reactionCount?: number; // present for own moments
  viewerReaction?: ReactionType | null;
}

export interface MomentAuthorGroupDTO {
  author: ProfileCardDTO;
  isSelf: boolean;
  allSeen: boolean;
  latestAt: string;
  moments: MomentDTO[];
}

// ─── Spaces ──────────────────────────────────────────────────────────────────

export interface SpaceDTO {
  id: string;
  slug: string;
  name: string;
  description: string;
  coverUrl: string | null;
  avatarUrl: string | null;
  rules: string;
  announcement: string;
  counts: {
    members: number;
    posts: number;
  };
  viewer: {
    isMember: boolean;
    role: SpaceRole | null;
  };
  createdAt: string;
}

export interface SpaceMemberDTO {
  role: SpaceRole;
  joinedAt: string;
  profile: ProfileCardDTO;
}

export interface ReactionUserDTO {
  profile: ProfileCardDTO;
  type: ReactionType;
  createdAt: string;
}

export interface ReactionToggleDTO {
  counts: { reactions: number };
  topReactions: { type: ReactionType; count: number }[];
  viewerReaction: ReactionType | null;
}

// ─── Saved / Collections ─────────────────────────────────────────────────────

export interface CollectionDTO {
  id: string;
  name: string;
  postCount: number;
  coverUrls: string[]; // up to 3 preview thumbs
  createdAt: string;
}

// ─── Search / Explore ────────────────────────────────────────────────────────

export interface HashtagDTO {
  tag: string;
  postCount: number;
}

export interface ExploreDTO {
  trendingHashtags: HashtagDTO[];
  suggestedUsers: ProfileCardDTO[];
  popularPosts: PostDTO[];
}

export interface SearchResultsDTO {
  people: ProfileCardDTO[];
  posts: PostDTO[];
  spaces: SpaceDTO[];
  hashtags: HashtagDTO[];
}

// ─── Notifications ───────────────────────────────────────────────────────────

export interface NotificationDTO {
  id: string;
  type: NotificationType;
  actor: ProfileCardDTO | null;
  postId: string | null;
  commentId: string | null;
  spaceId: string | null;
  spaceName: string | null;
  postPreview: string | null;
  preview: string | null;
  readAt: string | null;
  createdAt: string;
}

// ─── Follows ─────────────────────────────────────────────────────────────────

export interface FollowRequestDTO {
  id: string;
  requester: ProfileCardDTO;
  createdAt: string;
}

// ─── API envelope ────────────────────────────────────────────────────────────

export interface ApiError {
  code: string;
  message: string;
}
