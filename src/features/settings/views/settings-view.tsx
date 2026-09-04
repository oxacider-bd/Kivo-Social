"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import {
  Bell,
  Loader2,
  Lock,
  LogOut,
  Palette,
  Shield,
  UserRound,
} from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { navigateTo } from "@/lib/router";
import { useSession } from "@/lib/session-store";
import { changePassword } from "@/services/auth";
import {
  SUPABASE_PASSWORD_MIN_LENGTH,
  describeSupabasePasswordPolicy,
  meetsSupabasePasswordPolicy,
} from "@/lib/password-policy";
import type { NotificationPrefs, Privacy, ProfileDTO } from "@/types";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { UserAvatar } from "@/components/user-avatar";
import { EditProfileDialog } from "@/features/profile/components/edit-profile-dialog";
import { SupabaseStatusCard } from "@/features/settings/components/supabase-status-card";
import { ErrorState } from "@/components/empty-state";

type ProfilePatch = Partial<
  Pick<ProfileDTO, "isPrivate" | "defaultPrivacy" | "notificationPrefs">
>;

const NOTIFICATION_ROWS: {
  key: keyof NotificationPrefs;
  label: string;
  hint: string;
}[] = [
  { key: "reactions", label: "Reactions", hint: "When someone reacts to your posts" },
  { key: "comments", label: "Comments", hint: "When someone comments on your posts" },
  { key: "replies", label: "Replies", hint: "When someone replies to your comment" },
  { key: "follows", label: "Follows & requests", hint: "New followers and follow requests" },
  { key: "mentions", label: "Mentions", hint: "When someone @mentions you" },
  { key: "spaceActivity", label: "Space activity", hint: "New posts in spaces you've joined" },
];

const PRIVACY_OPTIONS: { value: Privacy; label: string }[] = [
  { value: "PUBLIC", label: "Public" },
  { value: "FOLLOWERS", label: "Followers" },
  { value: "ONLY_ME", label: "Only me" },
];

// ─── Section card shell ──────────────────────────────────────────────────────

function SectionCard({
  icon,
  title,
  description,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="gap-0 rounded-2xl py-0 card-shadow">
      <CardHeader className="flex-row items-start gap-3 space-y-0 p-5 pb-0">
        <span
          className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand"
          aria-hidden="true"
        >
          {icon}
        </span>
        <div className="min-w-0">
          <CardTitle className="text-sm font-semibold">{title}</CardTitle>
          <CardDescription className="mt-0.5 text-[13px]">{description}</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="px-5 pb-5 pt-4 sm:pl-[4.25rem]">{children}</CardContent>
    </Card>
  );
}

// ─── Appearance theme cards ──────────────────────────────────────────────────

function ThemePreview({ kind }: { kind: "light" | "dark" | "system" }) {
  const line = (tone: string) => <span className={cn("block h-1.5 rounded-full", tone)} />;
  if (kind === "light") {
    return (
      <div className="flex h-14 w-full items-center gap-1.5 overflow-hidden rounded-md border bg-white p-2">
        <span className="h-4 w-4 shrink-0 rounded-full bg-stone-200" aria-hidden="true" />
        <span className="flex-1 space-y-1.5">
          {line("bg-stone-200")}
          {line("bg-stone-100")}
        </span>
        <span className="h-4 w-4 shrink-0 rounded-md bg-brand/70" aria-hidden="true" />
      </div>
    );
  }
  if (kind === "dark") {
    return (
      <div className="flex h-14 w-full items-center gap-1.5 overflow-hidden rounded-md border bg-zinc-900 p-2">
        <span className="h-4 w-4 shrink-0 rounded-full bg-zinc-700" aria-hidden="true" />
        <span className="flex-1 space-y-1.5">
          {line("bg-zinc-700")}
          {line("bg-zinc-800")}
        </span>
        <span className="h-4 w-4 shrink-0 rounded-md bg-brand/70" aria-hidden="true" />
      </div>
    );
  }
  return (
    <div className="flex h-14 w-full overflow-hidden rounded-md border">
      <div className="flex w-1/2 items-center gap-1.5 bg-white p-2">
        <span className="h-3.5 w-3.5 shrink-0 rounded-full bg-stone-200" aria-hidden="true" />
        <span className="flex-1 space-y-1">
          {line("bg-stone-200")}
          {line("bg-stone-100")}
        </span>
      </div>
      <div className="flex w-1/2 items-center gap-1.5 bg-zinc-900 p-2">
        <span className="h-3.5 w-3.5 shrink-0 rounded-full bg-zinc-700" aria-hidden="true" />
        <span className="flex-1 space-y-1">
          {line("bg-zinc-700")}
          {line("bg-zinc-800")}
        </span>
      </div>
    </div>
  );
}

function AppearanceSection() {
  const { theme, setTheme } = useTheme();
  const active = theme ?? "system";
  const cards: { value: "light" | "dark" | "system"; label: string }[] = [
    { value: "light", label: "Light" },
    { value: "dark", label: "Dark" },
    { value: "system", label: "System" },
  ];
  return (
    <div role="radiogroup" aria-label="Theme" className="grid grid-cols-3 gap-2.5">
      {cards.map((card) => (
        <button
          key={card.value}
          type="button"
          role="radio"
          aria-checked={active === card.value}
          onClick={() => setTheme(card.value)}
          className={cn(
            "flex flex-col gap-2 rounded-xl border bg-card p-2.5 text-left outline-none transition-all duration-200 hover:border-brand/60 hover:shadow-sm focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.98]",
            active === card.value && "border-brand bg-brand-soft/40 ring-1 ring-brand",
          )}
        >
          <ThemePreview kind={card.value} />
          <span className="flex items-center gap-1.5 text-sm font-medium">
            <span
              className={cn(
                "h-2 w-2 rounded-full",
                active === card.value ? "bg-brand" : "bg-transparent ring-1 ring-border",
              )}
              aria-hidden="true"
            />
            {card.label}
          </span>
        </button>
      ))}
    </div>
  );
}

// ─── SettingsView ────────────────────────────────────────────────────────────

export default function SettingsView() {
  const queryClient = useQueryClient();
  const { user, signOut } = useSession();
  const [editOpen, setEditOpen] = useState(false);

  const profileQuery = useQuery({
    queryKey: ["profile", "me"],
    queryFn: ({ signal }) => api<ProfileDTO>("/api/profiles/me", { signal }),
  });
  const profile = profileQuery.data;

  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const patchMutation = useMutation({
    mutationFn: (patch: ProfilePatch) =>
      api<ProfileDTO>("/api/profiles/me", { method: "PATCH", body: patch }),
    onMutate: async (patch) => {
      await queryClient.cancelQueries({ queryKey: ["profile", "me"] });
      const prev = queryClient.getQueryData<ProfileDTO>(["profile", "me"]);
      queryClient.setQueryData<ProfileDTO>(["profile", "me"], (old) =>
        old ? { ...old, ...patch } : old,
      );
      return { prev };
    },
    onError: (err, _patch, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(["profile", "me"], ctx.prev);
      toast.error(err instanceof Error ? err.message : "Couldn't save that. Change reverted.");
    },
    onSuccess: (updated) => {
      queryClient.setQueryData<ProfileDTO>(["profile", "me"], (old) =>
        old ? { ...old, ...updated } : old,
      );
      // Keep the session store's profile in sync (nav, composer, etc. read it).
      const current = useSession.getState().user;
      if (current) {
        useSession.getState().setUser({ ...current, profile: { ...current.profile, ...updated } });
      }
    },
    onSettled: () => setPendingKey(null),
  });

  function applyPatch(key: string, patch: ProfilePatch) {
    setPendingKey(key);
    patchMutation.mutate(patch);
  }

  async function handleLogout() {
    await signOut();
    toast("Signed out. See you soon!");
    navigateTo("/login");
  }

  // ── Loading / error ──
  if (profileQuery.isLoading) {
    return (
      <div
        className="mx-auto w-full max-w-2xl space-y-6"
        role="status"
        aria-label="Loading settings"
      >
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-2xl border bg-card p-5">
            <div className="flex items-start gap-3">
              <div className="skeleton h-9 w-9 rounded-xl" />
              <div className="flex-1 space-y-2">
                <div className="skeleton h-4 w-28 rounded-md" />
                <div className="skeleton h-3 w-44 rounded-md" />
              </div>
            </div>
            <div className="mt-5 space-y-4">
              <div className="skeleton h-11 rounded-lg" />
              <div className="skeleton h-11 rounded-lg" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (profileQuery.isError || !profile) {
    return (
      <div className="mx-auto w-full max-w-2xl">
        <ErrorState
          className="mt-10"
          title="Couldn't load your settings"
          description={
            profileQuery.error instanceof ApiError && profileQuery.error.status === 401
              ? "Please sign in again to continue."
              : "Please try again in a moment."
          }
          action={
            <Button variant="outline" size="sm" onClick={() => void profileQuery.refetch()}>
              Try again
            </Button>
          }
        />
      </div>
    );
  }

  const prefs = profile.notificationPrefs;

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 pb-4">
      <h1 className="text-xl font-bold tracking-tight">Settings</h1>

      {/* ── 1. Account ── */}
      <SectionCard
        icon={<UserRound className="h-4.5 w-4.5" aria-hidden="true" />}
        title="Account"
        description="Your public identity on KIVO."
      >
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3.5">
            <UserAvatar
              username={profile.username}
              fullName={profile.fullName}
              avatarUrl={profile.avatarUrl}
              size={52}
              linkToProfile={false}
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-semibold">{profile.fullName}</p>
              <p className="truncate text-sm text-muted-foreground">@{profile.username}</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-10 shrink-0 rounded-full px-4"
              onClick={() => setEditOpen(true)}
            >
              Edit profile
            </Button>
          </div>
          <div className="flex items-center justify-between gap-3 rounded-xl border bg-muted/40 px-4 py-3">
            <div className="min-w-0">
              <p className="text-sm font-medium">Email</p>
              <p className="truncate text-[13px] text-muted-foreground">{user?.email ?? "—"}</p>
            </div>
            <span className="shrink-0 text-xs text-muted-foreground">
              Email can&apos;t be changed yet
            </span>
          </div>
        </div>
      </SectionCard>

      {/* ── 2. Privacy ── */}
      <SectionCard
        icon={<Lock className="h-4.5 w-4.5" aria-hidden="true" />}
        title="Privacy"
        description="Control who sees your content."
      >
        <div className="flex flex-col divide-y">
          <div className="flex min-h-14 items-center justify-between gap-4 py-2 first:pt-0 last:pb-0">
            <div>
              <Label htmlFor="private-profile" className="text-[15px]">
                Private profile
              </Label>
              <p className="mt-0.5 text-[13px] text-muted-foreground">
                Only approved followers can see your posts.
              </p>
            </div>
            <Switch
              id="private-profile"
              checked={profile.isPrivate}
              disabled={pendingKey === "isPrivate"}
              onCheckedChange={(checked) => {
                applyPatch("isPrivate", { isPrivate: checked });
                toast.success(checked ? "Your profile is now private" : "Your profile is now public");
              }}
            />
          </div>

          <div className="flex min-h-14 items-center justify-between gap-4 py-2 first:pt-0 last:pb-0">
            <div>
              <Label htmlFor="default-visibility" className="text-[15px]">
                Default post visibility
              </Label>
              <p className="mt-0.5 text-[13px] text-muted-foreground">
                Applied to new posts unless you choose otherwise.
              </p>
            </div>
            <Select
              value={profile.defaultPrivacy}
              onValueChange={(v) => {
                applyPatch("defaultPrivacy", { defaultPrivacy: v as Privacy });
                toast.success("Default visibility updated");
              }}
            >
              <SelectTrigger
                id="default-visibility"
                aria-label="Default post visibility"
                className="w-[140px] shrink-0"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PRIVACY_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </SectionCard>

      {/* ── 3. Notifications ── */}
      <SectionCard
        icon={<Bell className="h-4.5 w-4.5" aria-hidden="true" />}
        title="Notifications"
        description="Choose what deserves your attention."
      >
        <div className="flex flex-col divide-y">
          {NOTIFICATION_ROWS.map((row) => (
            <div key={row.key} className="flex min-h-14 items-center justify-between gap-4 py-2.5 first:pt-0 last:pb-0">
              <div>
                <Label htmlFor={`notif-${row.key}`} className="text-[15px]">
                  {row.label}
                </Label>
                <p className="mt-0.5 text-[13px] text-muted-foreground">{row.hint}</p>
              </div>
              <Switch
                id={`notif-${row.key}`}
                checked={prefs[row.key]}
                disabled={pendingKey === `notif-${row.key}`}
                onCheckedChange={(checked) => {
                  applyPatch(`notif-${row.key}`, {
                    notificationPrefs: { ...prefs, [row.key]: checked },
                  });
                }}
              />
            </div>
          ))}
        </div>
      </SectionCard>

      {/* ── 4. Appearance ── */}
      <SectionCard
        icon={<Palette className="h-4.5 w-4.5" aria-hidden="true" />}
        title="Appearance"
        description="How KIVO looks on this device."
      >
        <AppearanceSection />
      </SectionCard>

      {/* ── 5. Backend connection (Supabase) ── */}
      <SupabaseStatusCard />

      {/* ── 6. Security ── */}
      <SecuritySection />

      {/* ── 7. Sign out (destructive zone) ── */}
      <DangerZone onLogout={() => void handleLogout()} />

      {user && (
        <EditProfileDialog open={editOpen} onClose={() => setEditOpen(false)} profile={user.profile} />
      )}
    </div>
  );
}

// ─── Security section (change password) ──────────────────────────────────────

function SecuritySection() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!formError) return;
    // Clear inline errors as the user edits again.
    const t = setTimeout(() => setFormError(null), 6000);
    return () => clearTimeout(t);
  }, [formError]);

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    setFormError(null);

    // Same live policy Supabase enforces server-side — the Auth update call
    // remains the final authority; this is an up-front affordance only.
    if (!meetsSupabasePasswordPolicy(newPassword)) {
      setFormError(
        `Your new password needs at least ${SUPABASE_PASSWORD_MIN_LENGTH} characters, ` +
          `including upper and lowercase letters, a number and a special character.`
      );
      return;
    }
    if (newPassword !== confirmPassword) {
      setFormError("Passwords don't match.");
      return;
    }

    setSaving(true);
    try {
      // Real password change via Supabase Auth (current password is
      // re-verified server-side by Supabase before the update).
      await changePassword(currentPassword, newPassword);
      toast.success("Password updated");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Couldn't update your password.";
      setFormError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <SectionCard
      icon={<Shield className="h-4.5 w-4.5" aria-hidden="true" />}
      title="Security"
      description="Keep your account yours."
    >
      <div className="flex flex-col gap-5">
        <form onSubmit={handleChangePassword} className="flex flex-col gap-3" noValidate>
          <div className="grid gap-1.5">
            <Label htmlFor="current-password">Current password</Label>
            <Input
              id="current-password"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>
          <div className="grid gap-1.5 sm:grid-cols-2 sm:gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="new-password">New password</Label>
              <Input
                id="new-password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
                required
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="confirm-password">Confirm new password</Label>
              <Input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                required
              />
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            {describeSupabasePasswordPolicy()}
          </p>

          {formError && (
            <p role="alert" className="text-sm text-destructive">
              {formError}
            </p>
          )}

          <Button
            type="submit"
            className="self-start active:scale-[0.98]"
            disabled={saving}
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            Update password
          </Button>
        </form>
      </div>
    </SectionCard>
  );
}

// ─── Destructive zone (logout) ───────────────────────────────────────────────

function DangerZone({ onLogout }: { onLogout: () => void }) {
  return (
    <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 sm:p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-destructive/10 text-destructive"
            aria-hidden="true"
          >
            <LogOut className="h-4.5 w-4.5" />
          </span>
          <div>
            <p className="text-sm font-semibold">Log out</p>
            <p className="mt-0.5 text-[13px] text-muted-foreground">
              You can sign back in anytime.
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          className="h-10 shrink-0 border-destructive/30 bg-transparent text-destructive hover:bg-destructive/10 hover:text-destructive active:scale-[0.98]"
          onClick={onLogout}
        >
          <LogOut className="h-4 w-4" aria-hidden="true" /> Log out
        </Button>
      </div>
    </div>
  );
}
