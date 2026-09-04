"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Camera,
  Loader2,
  X,
} from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { useSession } from "@/lib/session-store";
import { uploadMedia } from "@/lib/upload";
import { USERNAME_REGEX } from "@/lib/validation";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ProfileDTO } from "@/types";

interface EditProfileDialogProps {
  open: boolean;
  onClose: () => void;
  profile: ProfileDTO | null;
}

/**
 * Edit profile dialog: avatar/cover upload (via /api/uploads), name,
 * username (server-verified uniqueness), bio and mood with counters.
 */
export function EditProfileDialog({ open, onClose, profile }: EditProfileDialogProps) {
  const queryClient = useQueryClient();
  const setUser = useSession((s) => s.setUser);

  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");
  const [mood, setMood] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);

  const [avatarBusy, setAvatarBusy] = useState(false);
  const [coverBusy, setCoverBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fieldError, setFieldError] = useState<{ field: "username" | "form"; message: string } | null>(null);

  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const coverInputRef = useRef<HTMLInputElement | null>(null);

  // Re-seed local state from the profile each time the dialog opens.
  useEffect(() => {
    if (open && profile) {
      setFullName(profile.fullName);
      setUsername(profile.username);
      setBio(profile.bio);
      setMood(profile.mood);
      setAvatarUrl(profile.avatarUrl);
      setCoverUrl(profile.coverUrl);
      setFieldError(null);
    }
  }, [open, profile]);

  const pickFile = useCallback(
    (inputRef: React.RefObject<HTMLInputElement | null>) => inputRef.current?.click(),
    [],
  );

  async function handleUpload(file: File | undefined, kind: "avatar" | "cover") {
    if (!file) return;
    const setBusy = kind === "avatar" ? setAvatarBusy : setCoverBusy;
    setBusy(true);
    try {
      const media = await uploadMedia(file, kind);
      if (kind === "avatar") setAvatarUrl(media.url);
      else setCoverUrl(media.url);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed. Try again.");
    } finally {
      setBusy(false);
      if (kind === "avatar" && avatarInputRef.current) avatarInputRef.current.value = "";
      if (kind === "cover" && coverInputRef.current) coverInputRef.current.value = "";
    }
  }

  const usernameClean = username.trim().toLowerCase();
  const usernameInvalid =
    usernameClean.length > 0 && !USERNAME_REGEX.test(usernameClean) && usernameClean !== profile?.username;

  async function handleSave() {
    if (!profile || saving) return;
    setFieldError(null);

    if (fullName.trim().length < 2) {
      setFieldError({ field: "form", message: "Your name needs at least 2 characters." });
      return;
    }
    if (!USERNAME_REGEX.test(usernameClean)) {
      setFieldError({
        field: "username",
        message: "3–20 characters: lowercase letters, numbers or underscores.",
      });
      return;
    }

    setSaving(true);
    try {
      const updated = await api<ProfileDTO>("/api/profiles/me", {
        method: "PATCH",
        body: {
          fullName: fullName.trim(),
          username: usernameClean,
          bio: bio.trim(),
          mood: mood.trim(),
          avatarUrl,
          coverUrl,
        },
      });
      // Keep the session store in sync + refresh any cached profile queries.
      const user = useSession.getState().user;
      if (user) setUser({ ...user, profile: updated });
      void queryClient.invalidateQueries({ queryKey: ["profile"] });
      toast.success("Profile updated");
      onClose();
    } catch (err) {
      if (err instanceof ApiError && err.code === "CONFLICT") {
        setFieldError({ field: "username", message: err.message });
      } else {
        setFieldError({
          field: "form",
          message: err instanceof Error ? err.message : "Couldn't save your profile. Try again.",
        });
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => (!v ? onClose() : undefined)}>
      <DialogContent className="scrollbar-slim max-h-[92svh] overflow-y-auto p-0 sm:max-w-lg">
        <DialogHeader className="sr-only">
          <DialogTitle>Edit profile</DialogTitle>
          <DialogDescription>Update your avatar, cover, name and bio.</DialogDescription>
        </DialogHeader>

        {/* Cover picker */}
        <div className="relative h-28 w-full overflow-hidden rounded-t-lg bg-muted">
          {coverUrl ? (
            <img src={coverUrl} alt="Profile cover" className="h-full w-full object-cover" />
          ) : (
            <div className="brand-gradient absolute inset-0" />
          )}
          <div className="absolute inset-0 bg-black/20 transition-colors" />
          <button
            type="button"
            onClick={() => pickFile(coverInputRef)}
            aria-label="Change cover photo"
            className="absolute inset-0 flex w-full items-center justify-center bg-black/0 text-white opacity-0 transition-all hover:bg-black/30 hover:opacity-100 focus-visible:bg-black/30 focus-visible:opacity-100"
          >
            {coverBusy ? (
              <Loader2 className="h-6 w-6 animate-spin" />
            ) : (
              <span className="flex items-center gap-2 rounded-full bg-black/40 px-3 py-1.5 text-sm font-medium backdrop-blur-sm">
                <Camera className="h-4 w-4" /> Change cover
              </span>
            )}
          </button>
          {coverUrl && (
            <button
              type="button"
              onClick={() => setCoverUrl(null)}
              aria-label="Remove cover photo"
              className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm transition-colors hover:bg-black/70"
            >
              <X className="h-4 w-4" />
            </button>
          )}
          <input
            ref={coverInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            className="hidden"
            aria-hidden="true"
            tabIndex={-1}
            onChange={(e) => void handleUpload(e.target.files?.[0], "cover")}
          />
        </div>

        {/* Avatar picker */}
        <div className="px-6 pb-2">
          <div className="relative -mt-10 inline-block">
            <button
              type="button"
              onClick={() => pickFile(avatarInputRef)}
              aria-label={avatarUrl ? "Change profile photo" : "Add profile photo"}
              className="group relative block h-[88px] w-[88px] overflow-hidden rounded-full ring-4 ring-background outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {avatarUrl ? (
                <img src={avatarUrl} alt="Profile avatar" className="h-full w-full object-cover" />
              ) : (
                <span className="brand-gradient flex h-full w-full items-center justify-center text-white">
                  <Camera className="h-7 w-7" />
                </span>
              )}
              <span className="absolute inset-0 flex items-center justify-center bg-black/0 text-white opacity-0 transition-all group-hover:bg-black/40 group-hover:opacity-100 group-focus-visible:bg-black/40 group-focus-visible:opacity-100">
                {avatarBusy ? <Loader2 className="h-6 w-6 animate-spin" /> : <Camera className="h-6 w-6" />}
              </span>
            </button>
            {avatarUrl && (
              <button
                type="button"
                onClick={() => setAvatarUrl(null)}
                aria-label="Remove profile photo"
                className="absolute -right-1 -top-1 flex h-7 w-7 items-center justify-center rounded-full border bg-card text-foreground shadow-sm transition-colors hover:bg-accent"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <input
            ref={avatarInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            className="hidden"
            aria-hidden="true"
            tabIndex={-1}
            onChange={(e) => void handleUpload(e.target.files?.[0], "avatar")}
          />
        </div>

        {/* Fields */}
        <div className="flex flex-col gap-4 px-6 pb-6">
          <div className="grid gap-2">
            <Label htmlFor="edit-fullName">Full name</Label>
            <Input
              id="edit-fullName"
              value={fullName}
              maxLength={50}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Ada Lovelace"
              autoComplete="name"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="edit-username">Username</Label>
            <div className="relative">
              <span
                className={cn(
                  "pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground",
                  usernameInvalid && "text-destructive",
                )}
                aria-hidden="true"
              >
                @
              </span>
              <Input
                id="edit-username"
                value={username}
                maxLength={20}
                onChange={(e) => setUsername(e.target.value.toLowerCase())}
                className={cn("pl-8", (usernameInvalid || fieldError?.field === "username") && "border-destructive focus-visible:ring-destructive/30")}
                placeholder="ada"
                autoComplete="username"
                aria-invalid={usernameInvalid || fieldError?.field === "username"}
                aria-describedby={usernameInvalid || fieldError?.field === "username" ? "edit-username-error" : undefined}
              />
            </div>
            {(usernameInvalid || fieldError?.field === "username") && (
              <p id="edit-username-error" role="alert" className="text-xs text-destructive">
                {fieldError?.field === "username"
                  ? fieldError.message
                  : "3–20 characters: lowercase letters, numbers or underscores."}
              </p>
            )}
          </div>

          <div className="grid gap-2">
            <div className="flex items-baseline justify-between">
              <Label htmlFor="edit-bio">Bio</Label>
              <span className={cn("text-xs text-muted-foreground", bio.length >= 280 && "text-destructive")}>
                {bio.length}/280
              </span>
            </div>
            <Textarea
              id="edit-bio"
              value={bio}
              maxLength={280}
              rows={3}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Tell the world who you are…"
              className="resize-none"
            />
          </div>

          <div className="grid gap-2">
            <div className="flex items-baseline justify-between">
              <Label htmlFor="edit-mood">Mood / status</Label>
              <span className={cn("text-xs text-muted-foreground", mood.length >= 60 && "text-destructive")}>
                {mood.length}/60
              </span>
            </div>
            <Input
              id="edit-mood"
              value={mood}
              maxLength={60}
              onChange={(e) => setMood(e.target.value)}
              placeholder="Building something 🚀"
            />
          </div>

          {fieldError?.field === "form" && (
            <p role="alert" className="text-sm text-destructive">
              {fieldError.message}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void handleSave()} disabled={saving || avatarBusy || coverBusy}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              Save changes
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
