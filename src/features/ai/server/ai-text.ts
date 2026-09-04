import "server-only";

/**
 * Helpers to coerce KIVO AI output into the shapes the API promises.
 * The model is instructed to reply with raw JSON or plain text, but it sometimes
 * wraps answers in ```json fences, bullets or quotes — these helpers tolerate all
 * of that with graceful fallbacks.
 */

/** Strips ``` / ```json code fences when the whole reply is fenced. */
export function stripCodeFences(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return (fenced ? fenced[1] : trimmed).trim();
}

/** Unwraps a single pair of matching surrounding quotes, if present. */
export function unwrapQuotes(text: string): string {
  const t = text.trim();
  const pairs: [string, string][] = [
    ['"', '"'],
    ["'", "'"],
    ["\u201C", "\u201D"], // “ ”
    ["\u2018", "\u2019"], // ‘ ’
  ];
  for (const [open, close] of pairs) {
    if (t.length >= 2 && t.startsWith(open) && t.endsWith(close)) {
      return t.slice(1, -1).trim();
    }
  }
  return t;
}

function collectStrings(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((v): v is string => typeof v === "string").map((v) => v.trim());
  }
  if (typeof value === "object" && value !== null) {
    // e.g. { "suggestions": ["a", "b", "c"] }
    for (const nested of Object.values(value as Record<string, unknown>)) {
      if (Array.isArray(nested)) {
        const strings = nested.filter((v): v is string => typeof v === "string").map((v) => v.trim());
        if (strings.length > 0) return strings;
      }
    }
  }
  return [];
}

function dedupe(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const key = item.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      out.push(item);
    }
  }
  return out;
}

/**
 * Parses a JSON list of strings out of the model reply, falling back to
 * line-by-line extraction (bullets, numbers, quotes are tolerated).
 */
export function parseSuggestions(raw: string, max = 3, maxChars = 200): string[] {
  const text = stripCodeFences(raw);

  try {
    const parsed: unknown = JSON.parse(text);
    const strings = collectStrings(parsed)
      .map(unwrapQuotes)
      .filter((s) => s.length > 0);
    if (strings.length > 0) {
      return dedupe(strings).slice(0, max).map((s) => s.slice(0, maxChars));
    }
  } catch {
    // not JSON — fall through to line parsing
  }

  const lines = text
    .split("\n")
    .map((line) => line.replace(/^\s*(?:[-*•–—]|\d+[.)])\s*/, "").trim())
    .map(unwrapQuotes)
    .filter((line) => line.length > 0 && !/^[{[]/.test(line));

  return dedupe(lines).slice(0, max).map((s) => s.slice(0, maxChars));
}

/** Parses a single free-text reply (improve / summarize), stripping fences+quotes. */
export function parseSingleText(raw: string): string {
  return unwrapQuotes(stripCodeFences(raw));
}
