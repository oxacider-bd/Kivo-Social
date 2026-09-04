import { z } from "zod";
import { HttpError, ok, parseBody, requireUser, route } from "@/lib/api-helpers";
import { rateLimit } from "@/lib/rate-limit";
import { kivoAI } from "@/features/ai/server/ai-client";
import { parseSuggestions } from "@/features/ai/server/ai-text";
import { KIVO_VOICE } from "@/features/ai/server/prompts";

const repliesSchema = z
  .object({
    comment: z
      .string()
      .trim()
      .min(1, "Add the comment you want to reply to.")
      .max(500, "Comments are limited to 500 characters."),
    postContent: z.string().trim().max(2000).optional(),
  })
  .strict();

const SYSTEM_PROMPT = `${KIVO_VOICE}
Task: write exactly 3 short, human-sounding replies to the given comment. The three must differ in tone: one warm, one witty, one thoughtful.
Hard rules:
- Each reply is at most 140 characters.
- No hashtags; at most one emoji.
- Sound like a real person talking to a friend, not a brand.
Reply with ONLY a JSON array of 3 strings — no explanations, no markdown.`;

/** POST /api/ai/replies  { comment, postContent? } → { suggestions: string[] } */
export const POST = route(async ({ req, user }) => {
  const authed = requireUser(user);
  if (!rateLimit(`ai:${authed.id}`, 12, 60_000)) throw new HttpError("RATE_LIMITED");

  const { comment, postContent } = await parseBody(req, repliesSchema);

  const context = postContent
    ? `Post for context:\n"""\n${postContent}\n"""\n\n`
    : "";
  const raw = await kivoAI(
    SYSTEM_PROMPT,
    `${context}Comment to reply to:\n"""\n${comment}\n"""\n\nWrite the 3 reply options now.`,
  );

  return ok({ suggestions: parseSuggestions(raw, 3, 140) });
});
