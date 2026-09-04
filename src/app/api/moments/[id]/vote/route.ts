import { db } from "@/lib/db";
import { HttpError, ok, parseBody, requireUser, route } from "@/lib/api-helpers";
import { votePollSchema } from "@/lib/validation";
import { mapPoll, requireVisibleMoment } from "@/features/moments/server/moment-mapper";

// POST /api/moments/:id/vote → { poll: PollDTO } — vote (or change vote) on a moment poll.
export const POST = route<{ id: string }>(async ({ params, req, user }) => {
  const authed = requireUser(user);
  const moment = await requireVisibleMoment(params.id, authed.id);
  const input = await parseBody(req, votePollSchema);

  const poll = await db.poll.findUnique({
    where: { momentId: moment.id },
    include: { options: { select: { id: true } } },
  });
  if (!poll) throw new HttpError("NOT_FOUND", "This moment doesn't have a poll.");
  if (!poll.options.some((o) => o.id === input.optionId)) {
    throw new HttpError("VALIDATION", "That option doesn't exist for this poll.");
  }

  await db.pollVote.upsert({
    where: { pollId_userId: { pollId: poll.id, userId: authed.id } },
    update: { optionId: input.optionId },
    create: { pollId: poll.id, optionId: input.optionId, userId: authed.id },
  });

  const fresh = await db.poll.findUnique({
    where: { id: poll.id },
    include: { options: { include: { votes: { select: { userId: true } } } } },
  });
  if (!fresh) throw new HttpError("NOT_FOUND", "This poll is no longer available.");
  return ok({ poll: mapPoll(fresh, authed.id) });
});
