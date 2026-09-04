"use client";

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { SpaceDTO } from "@/types";

/** Owner-only editor for a space's identity, rules and announcement. */
export function EditSpaceDialog({
  space,
  open,
  onClose,
}: {
  space: SpaceDTO;
  open: boolean;
  onClose: () => void;
}) {
  const [name, setName] = useState(space.name);
  const [description, setDescription] = useState(space.description);
  const [rules, setRules] = useState(space.rules);
  const [announcement, setAnnouncement] = useState(space.announcement);
  const [submitting, setSubmitting] = useState(false);
  const queryClient = useQueryClient();

  // Re-sync fields whenever a different space (or fresh data) arrives.
  useEffect(() => {
    if (!open) return;
    setName(space.name);
    setDescription(space.description);
    setRules(space.rules);
    setAnnouncement(space.announcement);
  }, [open, space]);

  const canSubmit = name.trim().length >= 3 && !submitting;

  async function submit() {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      await api<SpaceDTO>(`/api/spaces/${space.slug}`, {
        method: "PATCH",
        body: {
          name: name.trim(),
          description: description.trim(),
          rules: rules.trim(),
          announcement: announcement.trim(),
        },
      });
      toast.success("Space updated");
      void queryClient.invalidateQueries({ queryKey: ["space", space.slug] });
      void queryClient.invalidateQueries({ queryKey: ["spaces"] });
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't update the space.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="scrollbar-slim max-h-[85vh] overflow-y-auto rounded-2xl sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit space</DialogTitle>
          <DialogDescription>
            Only visible to you right now — more admin powers later.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="edit-space-name">Name</Label>
            <Input
              id="edit-space-name"
              value={name}
              onChange={(e) => setName(e.target.value.slice(0, 40))}
              maxLength={40}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="edit-space-description">Description</Label>
            <Textarea
              id="edit-space-description"
              value={description}
              onChange={(e) => setDescription(e.target.value.slice(0, 300))}
              rows={3}
              maxLength={300}
              className="resize-none"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="edit-space-rules">Rules</Label>
            <Textarea
              id="edit-space-rules"
              value={rules}
              onChange={(e) => setRules(e.target.value.slice(0, 3000))}
              placeholder={"One rule per line, e.g.\nBe kind.\nNo spam."}
              rows={4}
              maxLength={3000}
              className="resize-none"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="edit-space-announcement">Announcement</Label>
            <Textarea
              id="edit-space-announcement"
              value={announcement}
              onChange={(e) => setAnnouncement(e.target.value.slice(0, 600))}
              placeholder="Pinned at the top for members."
              rows={3}
              maxLength={600}
              className="resize-none"
            />
          </div>

          <Button
            type="button"
            className="w-full rounded-full font-semibold active:scale-[0.98]"
            disabled={!canSubmit}
            onClick={() => void submit()}
          >
            {submitting && <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" />}
            Save changes
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
