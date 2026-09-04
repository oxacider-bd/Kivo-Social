import { z } from "zod";
import { HttpError, ok, parseBody, requireUser, route } from "@/lib/api-helpers";
import { rateLimit } from "@/lib/rate-limit";
import { kivoAI } from "@/features/ai/server/ai-client";
import { parseSuggestions } from "@/features/ai/server/ai-text";
import { KIVO_VOICE } from "@/features/ai/server/prompts";

const captionSchema = z
  .object({
    context: z
      .string()
      .trim()
      .min(1, "Add a little context first.")
      .max(500, "Keep the context under 500 characters."),
  })
  .strict();

const SYSTEM_PROMPT = `${KIVO_VOICE}
Task: write exactly 3 caption options for the user's post context, each from a different angle (one warm/heartfelt, one playful, one short-and-punchy).
Hard rules:
- Each caption is at most 120 characters.
- At most one hashtag per caption (skip hashtags entirely unless one genuinely fits).
- At most one emoji per caption.
- No quotation marks around the captions, no numbering, no labels.
Reply with ONLY a JSON array of 3 strings — no explanations, no markdown.`;

/** POST /api/ai/caption  { context } → { suggestions: string[] } */
export const POST = route(async ({ req, user }) => {
  const authed = requireUser(user);
  if (!rateLimit(`ai:${authed.id}`, 12, 60_000)) throw new HttpError("RATE_LIMITED");

  const { context } = await parseBody(req, captionSchema);

  const raw = await kivoAI(
    SYSTEM_PROMPT,
    `Post context:\n"""\n${context}\n"""\n\nWrite the 3 caption options now.`,
  );

  return ok({ suggestions: parseSuggestions(raw, 3, 120) });
});
