import { z } from "zod";
import { HttpError, ok, parseBody, requireUser, route } from "@/lib/api-helpers";
import { rateLimit } from "@/lib/rate-limit";
import { kivoAI } from "@/features/ai/server/ai-client";
import { parseSingleText } from "@/features/ai/server/ai-text";
import { KIVO_VOICE } from "@/features/ai/server/prompts";

const summarizeSchema = z
  .object({
    comments: z
      .array(
        z
          .string()
          .trim()
          .min(1)
          .max(500, "Each comment is limited to 500 characters."),
      )
      .min(1, "Add at least one comment to summarize.")
      .max(40, "Summarize up to 40 comments at a time."),
  })
  .strict();

const SYSTEM_PROMPT = `${KIVO_VOICE}
Task: summarize what the given comment thread is about in at most 60 words. Neutral, friendly and objective — start with "What this thread is about:" followed by 1–2 crisp sentences. Do not list usernames unless essential; do not editorialize or give advice.
Reply with ONLY the summary text.`;

/** POST /api/ai/summarize  { comments: string[] } → { summary: string } */
export const POST = route(async ({ req, user }) => {
  const authed = requireUser(user);
  if (!rateLimit(`ai:${authed.id}`, 12, 60_000)) throw new HttpError("RATE_LIMITED");

  const { comments } = await parseBody(req, summarizeSchema);

  const transcript = comments.map((c, i) => `${i + 1}. ${c}`).join("\n");
  const raw = await kivoAI(
    SYSTEM_PROMPT,
    `Comments (oldest first):\n${transcript}`,
  );

  return ok({ summary: parseSingleText(raw) });
});
