"use client";

import { memo, useMemo } from "react";
import Link from "next/link";

/**
 * Renders plain text safely (React escaping) with #hashtags, @mentions and
 * URLs turned into interactive elements. No dangerouslySetInnerHTML.
 */
export const RichText = memo(function RichText({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  const parts = useMemo(() => tokenize(text), [text]);
  return (
    <span className={className} style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
      {parts.map((p, i) => {
        if (p.kind === "hashtag") {
          return (
            <Link
              key={i}
              href={`#/hashtag/${encodeURIComponent(p.value.slice(1).toLowerCase())}`}
              className="font-medium text-brand hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              {p.value}
            </Link>
          );
        }
        if (p.kind === "mention") {
          return (
            <Link
              key={i}
              href={`#/profile/${p.value.slice(1).toLowerCase()}`}
              className="font-medium text-brand hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              {p.value}
            </Link>
          );
        }
        if (p.kind === "url") {
          return (
            <a
              key={i}
              href={p.value}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="text-brand underline decoration-brand/30 underline-offset-2 hover:decoration-brand"
              onClick={(e) => e.stopPropagation()}
            >
              {p.display}
            </a>
          );
        }
        return <span key={i}>{p.value}</span>;
      })}
    </span>
  );
});

type Part =
  | { kind: "text"; value: string }
  | { kind: "hashtag"; value: string }
  | { kind: "mention"; value: string }
  | { kind: "url"; value: string; display: string };

const URL_RE = /(https?:\/\/[^\s<>"')\]]+)/g;

function tokenize(text: string): Part[] {
  const out: Part[] = [];
  // split by URL first
  const segments = text.split(URL_RE);
  for (const seg of segments) {
    if (!seg) continue;
    if (/^https?:\/\//.test(seg)) {
      out.push({ kind: "url", value: seg, display: prettyUrl(seg) });
      continue;
    }
    // split hashtags/mentions within the segment
    let last = 0;
    const re = /([#@][a-zA-Z0-9_]{1,40})/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(seg))) {
      if (m.index > last) out.push({ kind: "text", value: seg.slice(last, m.index) });
      const isPrecededByWord = m.index > 0 && /[a-zA-Z0-9_@#]/.test(seg[m.index - 1]);
      if (isPrecededByWord) {
        out.push({ kind: "text", value: m[1] });
      } else if (m[1].startsWith("#")) {
        out.push({ kind: "hashtag", value: m[1] });
      } else {
        out.push({ kind: "mention", value: m[1] });
      }
      last = m.index + m[1].length;
    }
    if (last < seg.length) out.push({ kind: "text", value: seg.slice(last) });
  }
  return out;
}

function prettyUrl(url: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname === "/" ? "" : u.pathname;
    return u.host.replace(/^www\./, "") + path + (path.length > 32 ? "…" : "");
  } catch {
    return url;
  }
}
