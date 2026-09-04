import "server-only";
import ZAI from "z-ai-web-dev-sdk";
import { HttpError } from "@/lib/api-helpers";

const TIMEOUT_MS = 20_000;

interface ChatCompletionLike {
  choices?: { message?: { content?: string } }[];
}

async function attempt(system: string, user: string): Promise<string> {
  const signal = AbortSignal.timeout(TIMEOUT_MS);
  const timedOut = new Promise<never>((_, reject) => {
    signal.addEventListener(
      "abort",
      () => reject(new Error("KIVO AI request timed out.")),
      { once: true },
    );
  });

  const completion = (await Promise.race([
    (async () => {
      const zai = await ZAI.create();
      return zai.chat.completions.create({
        messages: [
          { role: "assistant", content: system },
          { role: "user", content: user },
        ],
        thinking: { type: "disabled" },
      });
    })(),
    timedOut,
  ])) as ChatCompletionLike;

  return completion.choices?.[0]?.message?.content ?? "";
}

/**
 * Single entry point to KIVO AI (backend only). 20s timeout, one retry, and a
 * friendly INTERNAL error when the model is unavailable.
 */
export async function kivoAI(system: string, user: string): Promise<string> {
  try {
    return await attempt(system, user);
  } catch (firstError) {
    try {
      return await attempt(system, user);
    } catch (retryError) {
      console.error(
        "[kivoAI] failed after retry:",
        (retryError as Error)?.message ?? retryError,
        { firstError },
      );
      throw new HttpError("INTERNAL", "KIVO AI is taking a nap. Try again shortly.");
    }
  }
}
