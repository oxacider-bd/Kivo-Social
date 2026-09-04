import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import {
  getCursorFrom,
  getLimitFrom,
  HttpError,
  makePage,
  ok,
  requireUser,
  route,
} from "@/lib/api-helpers";
import {
  mapPosts,
  postInclude,
  visibleProfilePostsWhere,
} from "@/services/posts-service";
import {
  getProfileByUsernameOr404,
  getViewerFlags,
  seekAfter,
} from "../../_lib/profile-server";

type Ctx = { username: string };

// ─── GET /api/profiles/:username/posts?tab=posts|photos|videos&cursor ────────

export const GET = route<Ctx>(async ({ req, user, params }) => {
  const authed = requireUser(user);
  const profile = await getProfileByUsernameOr404(params.username);
  const viewer = await getViewerFlags(authed.id, profile);

  if (!viewer.canViewContent) {
    throw new HttpError(
      "FORBIDDEN",
      "This account is private. Follow them to see their posts.",
    );
  }

  const tabParam = req.nextUrl.searchParams.get("tab");
  const tab = tabParam === "photos" || tabParam === "videos" ? tabParam : "posts";
  const limit = getLimitFrom(req, 10, 30);
  const cursor = getCursorFrom(req);

  const base = visibleProfilePostsWhere(
    authed.id,
    profile.userId,
    viewer.isSelf,
    viewer.isFollowing,
  ) as Prisma.PostWhereInput;

  const mediaFilter: Prisma.PostWhereInput =
    tab === "photos"
      ? { media: { some: { type: "image" } } }
      : tab === "videos"
        ? { media: { some: { type: "video" } } }
        : {};

  const seek = seekAfter(cursor);

  const rows = await db.post.findMany({
    where: {
      AND: [base, mediaFilter, ...(seek ? [seek] : [])],
    },
    include: postInclude,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
  });

  const page = makePage(rows, limit);
  const items = await mapPosts(page.items, authed.id);
  return ok({ items, nextCursor: page.nextCursor });
});
