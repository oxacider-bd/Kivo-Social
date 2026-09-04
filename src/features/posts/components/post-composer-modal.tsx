"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ComposerForm } from "@/features/posts/components/post-composer";
import { useComposer } from "@/lib/ui-store";

/**
 * Global composer modal — opened anywhere via the useComposer store
 * (optionally preset to a space). Renders the full ComposerForm.
 */
export default function PostComposerModal() {
  const { open, spacePreset, closeComposer } = useComposer();

  return (
    <Dialog open={open} onOpenChange={(o) => !o && closeComposer()}>
      <DialogContent
        className="max-h-[90vh] max-w-[calc(100%-2rem)] gap-0 overflow-y-auto rounded-2xl border bg-card p-0 scrollbar-slim sm:max-w-xl [&>button]:h-8 [&>button]:w-8 [&>button]:rounded-full"
        aria-describedby={undefined}
      >
        <DialogHeader className="sr-only">
          <DialogTitle>Create a post</DialogTitle>
        </DialogHeader>
        <div className="p-4 pb-2 sm:p-5 sm:pb-3">
          <ComposerForm spacePreset={spacePreset} onPosted={closeComposer} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
