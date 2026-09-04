import {
  HttpError,
  ok,
  parseBody,
  requireUser,
  route,
} from "@/lib/api-helpers";
import { db } from "@/lib/db";
import { votePollSchema } from "@/lib/validation";
import { requireVisiblePost } from "@/features/posts/server/post-guard";
import type { PollDTO, PollOptionDTO } from "@/types";

/**
 * POST /api/posts/:id/vote { optionId } → { poll: PollDTO }
 * One vote per user per poll (unique pollId+userId); changing the vote
 * updates the option. Closed polls (endsAt in the past) reject votes.
 */
export const POST = route<{ id: string }>(async ({ req, user, params }) => {
  const authed = requireUser(user);
  const body = await parseBody(req, votePollSchema);
  await requireVisiblePost(params.id, authed.id);

  const poll = await db.poll.findUnique({
    where: { postId: params.id },
    include: { options: { orderBy: { position: "asc" } } },
  });
  if (!poll) throw new HttpError("NOT_FOUND", "This post doesn't have a poll.");
  if (poll.endsAt && poll.endsAt.getTime() <= Date.now()) {
    throw new HttpError("VALIDATION", "This poll has ended — votes are closed.");
  }
  if (!poll.options.some((o) => o.id === body.optionId)) {
    throw new HttpError("VALIDATION", "Pick one of the listed options.");
  }

  await db.pollVote.upsert({
    where: { pollId_userId: { pollId: poll.id, userId: authed.id } },
    update: { optionId: body.optionId },
    create: { pollId: poll.id, optionId: body.optionId, userId: authed.id },
  });

  const fresh = await db.poll.findUnique({
    where: { id: poll.id },
    include: {
      options: {
        orderBy: { position: "asc" },
        include: { votes: { select: { userId: true } } },
      },
    },
  });
  if (!fresh) throw new HttpError("NOT_FOUND", "This poll no longer exists.");

  const options: PollOptionDTO[] = fresh.options.map((o) => ({
    id: o.id,
    text: o.text,
    voteCount: o.votes.length,
    votedByViewer: o.votes.some((v) => v.userId === authed.id),
  }));
  const dto: PollDTO = {
    id: fresh.id,
    options,
    totalVotes: options.reduce((sum, o) => sum + o.voteCount, 0),
    endsAt: fresh.endsAt?.toISOString() ?? null,
  };
  return ok({ poll: dto });
});
