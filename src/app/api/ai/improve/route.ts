import { z } from "zod";
import { HttpError, ok, parseBody, requireUser, route } from "@/lib/api-helpers";
import { rateLimit } from "@/lib/rate-limit";
import { kivoAI } from "@/features/ai/server/ai-client";
import { parseSingleText } from "@/features/ai/server/ai-text";
import { KIVO_VOICE } from "@/features/ai/server/prompts";

const TONES = ["professional", "friendly", "funny", "emotional", "short"] as const;

const improveSchema = z
  .object({
    text: z
      .string()
      .trim()
      .min(1, "Write a draft first.")
      .max(2000, "Drafts are limited to 2,000 characters."),
    tone: z.enum(TONES),
  })
  .strict();

const SYSTEM_PROMPT = `${KIVO_VOICE}
Task: rewrite the user's draft in the requested tone while keeping their natural voice, meaning and key details. Never add hashtags unless the draft already contains them; never invent facts; keep formatting simple (plain sentences, line breaks only if the draft had them).
If the tone is "short", compress the result to at most 280 characters.
Reply with ONLY the rewritten text — no quotes, no preamble, no explanations.`;

/** POST /api/ai/improve  { text, tone } → { text: string } */
export const POST = route(async ({ req, user }) => {
  const authed = requireUser(user);
  if (!rateLimit(`ai:${authed.id}`, 12, 60_000)) throw new HttpError("RATE_LIMITED");

  const { text, tone } = await parseBody(req, improveSchema);

  const raw = await kivoAI(
    SYSTEM_PROMPT,
    `Tone: ${tone}\n\nDraft:\n"""\n${text}\n"""`,
  );

  return ok({ text: parseSingleText(raw) });
});
