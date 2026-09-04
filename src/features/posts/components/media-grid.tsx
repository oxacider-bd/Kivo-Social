"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { PostMediaDTO } from "@/types";

/**
 * 1–4 media layout with a lightbox for images.
 * 1 = large single · 2 = two columns · 3 = one big + two stacked · 4 = 2×2.
 * Videos render inline with controls; images open the fullscreen lightbox.
 */
export function MediaGrid({ media }: { media: PostMediaDTO[] }) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const images = useMemo(() => media.filter((m) => m.type === "image"), [media]);

  const closeLightbox = useCallback(() => setLightboxIndex(null), []);
  const step = useCallback(
    (dir: 1 | -1) =>
      setLightboxIndex((i) => {
        if (i === null || images.length === 0) return i;
        const currentIdx = images.findIndex((im) => im.id === media[i]?.id);
        const next = ((currentIdx === -1 ? 0 : currentIdx) + dir + images.length) % images.length;
        return media.findIndex((m) => m.id === images[next]?.id);
      }),
    [images, media],
  );

  // Keyboard arrows while the lightbox is open.
  useEffect(() => {
    if (lightboxIndex === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") step(1);
      if (e.key === "ArrowLeft") step(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightboxIndex, step]);

  if (media.length === 0) return null;
  const count = Math.min(media.length, 4);
  const shown = media.slice(0, 4);

  return (
    <div className="mt-3">
      <div
        className={cn(
          "grid gap-0.5 overflow-hidden rounded-xl sm:gap-1",
          count === 1 && "grid-cols-1",
          count === 2 && "grid-cols-2",
          count === 3 && "grid-cols-2 grid-rows-2",
          count === 4 && "grid-cols-2 grid-rows-2",
        )}
      >
        {shown.map((m, i) => (
          <MediaCell
            key={m.id}
            media={m}
            big={count === 1 || (count === 3 && i === 0)}
            tall={count === 3 && i === 0}
            onOpen={m.type === "image" ? () => setLightboxIndex(i) : undefined}
          />
        ))}
      </div>

      <Dialog open={lightboxIndex !== null} onOpenChange={(o) => !o && closeLightbox()}>
        <DialogContent
          showCloseButton={false}
          className="max-w-none gap-0 overflow-hidden border-none bg-black/95 p-0 sm:max-w-none sm:rounded-xl [&>button]:hidden"
          aria-describedby={undefined}
        >
          <DialogTitle className="sr-only">Image viewer</DialogTitle>
          {lightboxIndex !== null && media[lightboxIndex] && (
            <LightboxImage media={media[lightboxIndex]} />
          )}
          {images.length > 1 && (
            <>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => step(-1)}
                aria-label="Previous image"
                className="absolute top-1/2 left-2 h-11 w-11 -translate-y-1/2 rounded-full bg-black/40 text-white hover:bg-black/60 hover:text-white"
              >
                <ChevronLeft className="h-6 w-6" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => step(1)}
                aria-label="Next image"
                className="absolute top-1/2 right-2 h-11 w-11 -translate-y-1/2 rounded-full bg-black/40 text-white hover:bg-black/60 hover:text-white"
              >
                <ChevronRight className="h-6 w-6" />
              </Button>
            </>
          )}
          <DialogPrimitive.Close
            aria-label="Close viewer"
            className="absolute top-3 right-3 flex h-10 w-10 items-center justify-center rounded-full bg-black/40 text-white outline-none transition-colors hover:bg-black/60 focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="h-5 w-5" />
          </DialogPrimitive.Close>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MediaCell({
  media,
  big,
  tall,
  onOpen,
}: {
  media: PostMediaDTO;
  big: boolean;
  tall: boolean;
  onOpen?: () => void;
}) {
  const shared =
    "h-full w-full bg-muted object-cover transition-opacity duration-150 hover:opacity-95";
  const wrapper = cn("relative min-h-0", tall && "row-span-2", big && "max-h-[480px]");

  if (media.type === "video") {
    return (
      <div className={wrapper}>
        <video
          src={media.url}
          controls
          preload="metadata"
          playsInline
          className={cn(shared, "bg-black")}
          aria-label="Post video"
        />
      </div>
    );
  }

  return (
    <div className={wrapper}>
      {onOpen ? (
        <button
          type="button"
          onClick={onOpen}
          aria-label="Open image fullscreen"
          className="block h-full w-full cursor-zoom-in outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <img
            src={media.url}
            alt="Post image"
            loading="lazy"
            className={cn(shared, big ? "aspect-auto" : "aspect-square")}
          />
        </button>
      ) : (
        <img
          src={media.url}
          alt="Post image"
          loading="lazy"
          className={cn(shared, big ? "aspect-auto" : "aspect-square")}
        />
      )}
    </div>
  );
}

function LightboxImage({ media }: { media: PostMediaDTO }) {
  return (
    <div className="flex h-[80vh] w-full items-center justify-center p-2 sm:p-6">
      <img
        src={media.url}
        alt="Post image"
        className="max-h-full max-w-full rounded-lg object-contain"
      />
    </div>
  );
}
