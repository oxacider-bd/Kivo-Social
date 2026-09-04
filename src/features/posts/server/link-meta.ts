import "server-only";

export interface LinkMeta {
  title: string | null;
  description: string | null;
  image: string | null;
}

const USER_AGENT =
  "Mozilla/5.0 (compatible; KIVOLinkBot/1.0; +https://kivo.app/bot)";
const FETCH_TIMEOUT_MS = 3000;
const MAX_REDIRECTS = 3;
const MAX_BODY_BYTES = 512 * 1024;

/**
 * Fetches a URL and extracts <title>, og:description and og:image.
 * Hard limits: 3s total-ish per hop (AbortSignal), ≤3 redirects, ≤512KB read.
 * Never throws — returns null on any failure so post creation keeps the link.
 */
export async function fetchLinkMetadata(rawUrl: string): Promise<LinkMeta | null> {
  try {
    let current: URL;
    try {
      current = new URL(rawUrl);
    } catch {
      return null;
    }
    // Only http(s); never touch localhost/private ranges (SSRF hygiene).
    if (!["http:", "https:"].includes(current.protocol)) return null;
    if (isPrivateHost(current.hostname)) return null;

    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const res = await fetch(current.toString(), {
        redirect: "manual",
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: { "user-agent": USER_AGENT, accept: "text/html,application/xhtml+xml,*/*;q=0.8" },
      });
      if ([301, 302, 303, 307, 308].includes(res.status)) {
        const location = res.headers.get("location");
        if (!location) return null;
        current = new URL(location, current);
        if (!["http:", "https:"].includes(current.protocol)) return null;
        continue;
      }
      if (!res.ok) return null;
      const contentType = res.headers.get("content-type") ?? "";
      if (contentType && !contentType.includes("html")) return null;
      const html = await readCappedBody(res);
      return parseMeta(html, current.toString());
    }
    return null;
  } catch {
    // Timeout, DNS failure, bad HTML — metadata is best-effort only.
    return null;
  }
}

function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) return true;
  if (/^(127|10)\./.test(host)) return true;
  if (/^192\.168\./.test(host)) return true;
  if (/^169\.254\./.test(host)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return true;
  if (host === "0.0.0.0" || host === "[::1]" || host === "::1") return true;
  return false;
}

async function readCappedBody(res: Response, cap = MAX_BODY_BYTES): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (total < cap) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.byteLength;
  }
  void reader.cancel().catch(() => {});
  const merged = new Uint8Array(Math.min(total, cap));
  let offset = 0;
  for (const chunk of chunks) {
    if (offset >= merged.length) break;
    merged.set(chunk.subarray(0, merged.length - offset), offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(merged);
}

function parseMeta(html: string, baseUrl: string): LinkMeta {
  const title =
    metaContent(html, "og:title") ??
    metaContent(html, "twitter:title") ??
    firstTag(html, "title");
  const description =
    metaContent(html, "og:description") ?? metaContent(html, "twitter:description") ?? metaContent(html, "description");
  let image = metaContent(html, "og:image") ?? metaContent(html, "og:image:secure_url") ?? metaContent(html, "twitter:image");
  if (image) {
    try {
      image = new URL(image, baseUrl).toString();
    } catch {
      image = null;
    }
  }
  return {
    title: clean(title),
    description: clean(description),
    image,
  };
}

function clean(value: string | null): string | null {
  if (!value) return null;
  const decoded = decodeEntities(value).replace(/\s+/g, " ").trim();
  return decoded.length > 0 ? decoded.slice(0, 300) : null;
}

function metaContent(html: string, name: string): string | null {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]*content=["']([^"']*)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${escaped}["']`, "i"),
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m?.[1]) return m[1];
  }
  return null;
}

function firstTag(html: string, tag: string): string | null {
  const m = html.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  return m?.[1] ?? null;
}

function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#x27;/gi, "'")
    .replace(/&#x2F;/gi, "/");
}
