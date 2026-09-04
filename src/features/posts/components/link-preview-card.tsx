"use client";

import { memo } from "react";
import { ExternalLink } from "lucide-react";
import type { LinkPreviewDTO } from "@/types";

/** Bordered link preview card — whole card is a safe external link. */
export const LinkPreviewCard = memo(function LinkPreviewCard({
  link,
}: {
  link: LinkPreviewDTO;
}) {
  let hostname = "";
  try {
    hostname = new URL(link.url).host.replace(/^www\./, "");
  } catch {
    hostname = link.url;
  }

  return (
    <a
      href={link.url}
      target="_blank"
      rel="noopener noreferrer nofollow"
      aria-label={`Open link: ${link.title ?? hostname}`}
      className="group mt-3 block overflow-hidden rounded-xl border bg-muted/40 outline-none transition-colors hover:border-brand/40 focus-visible:ring-2 focus-visible:ring-ring"
      onClick={(e) => e.stopPropagation()}
    >
      {link.image && (
        <div className="h-40 w-full overflow-hidden bg-muted sm:h-44">
          { }
          <img
            src={link.image}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.02]"
          />
        </div>
      )}
      <div className="flex items-start gap-3 p-3">
        <div className="min-w-0 flex-1">
          {link.title && (
            <p className="line-clamp-1 text-sm font-semibold group-hover:text-brand">
              {link.title}
            </p>
          )}
          {link.description && (
            <p className="mt-0.5 line-clamp-2 text-[13px] leading-snug text-muted-foreground">
              {link.description}
            </p>
          )}
          <p className="mt-1.5 flex items-center gap-1 text-xs text-muted-foreground">
            <ExternalLink className="h-3 w-3" aria-hidden="true" />
            {hostname}
          </p>
        </div>
      </div>
    </a>
  );
});
