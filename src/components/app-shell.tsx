"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/lib/session-store";
import { useComposer } from "@/lib/ui-store";
import { navigateTo } from "@/lib/router";
import { cn } from "@/lib/utils";
import { KivoBrand } from "@/components/kivo-brand";
import { UserAvatar } from "@/components/user-avatar";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ThemeToggleMenuItem } from "@/components/theme-toggle";
import {
  UNREAD_COUNT_KEY,
  fetchUnreadCount,
} from "@/features/notifications/lib/notifications-client";
import {
  Bell,
  Bookmark,
  ChevronsUpDown,
  Compass,
  Home,
  LogOut,
  Plus,
  Search,
  Settings,
  User as UserIcon,
  UsersRound,
} from "lucide-react";
import { toast } from "sonner";
import type { ReactNode } from "react";

interface NavItem {
  label: string;
  icon: ReactNode;
  href: string;
  match: (path: string) => boolean;
  badge?: number;
}

function navItems(unread: number, username: string): NavItem[] {
  return [
    { label: "Home", icon: <Home className="h-5 w-5" />, href: "#/", match: (p) => p === "/" },
    { label: "Explore", icon: <Compass className="h-5 w-5" />, href: "#/explore", match: (p) => p.startsWith("/explore") },
    { label: "Spaces", icon: <UsersRound className="h-5 w-5" />, href: "#/spaces", match: (p) => p.startsWith("/spaces") },
    { label: "Saved", icon: <Bookmark className="h-5 w-5" />, href: "#/saved", match: (p) => p.startsWith("/saved") },
    {
      label: "Notifications",
      icon: <Bell className="h-5 w-5" />,
      href: "#/notifications",
      match: (p) => p.startsWith("/notifications"),
      badge: unread,
    },
    {
      label: "Profile",
      icon: <UserIcon className="h-5 w-5" />,
      href: `#/profile/${username}`,
      match: (p) => p.startsWith("/profile"),
    },
    { label: "Settings", icon: <Settings className="h-5 w-5" />, href: "#/settings", match: (p) => p.startsWith("/settings") },
  ];
}

function useUnread(): number {
  const status = useSession((s) => s.status);
  const { data } = useQuery({
    queryKey: UNREAD_COUNT_KEY,
    queryFn: ({ signal }) => fetchUnreadCount(signal),
    enabled: status === "authenticated",
    staleTime: 15_000,
    refetchInterval: 60_000,
  });
  return data ?? 0;
}

function SidebarNav({ path }: { path: string }) {
  const user = useSession((s) => s.user);
  const unread = useUnread();
  const openComposer = useComposer((s) => s.openComposer);
  const items = navItems(unread, user?.profile.username ?? "");

  return (
    <nav aria-label="Primary" className="flex h-full flex-col gap-1 p-3">
      <Link
        href="#/"
        className="mb-3 flex h-14 items-center rounded-lg px-2 py-1 outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label="KIVO home"
      >
        <KivoBrand />
      </Link>

      <Button
        onClick={() => openComposer()}
        size="lg"
        className="mb-5 h-11 w-full justify-center gap-2 rounded-xl bg-brand text-[15px] font-semibold shadow-md shadow-brand/20 transition-all duration-200 hover:bg-brand-hover active:scale-[0.98]"
      >
        <Plus className="h-5 w-5" />
        Create
      </Button>

      {items.map((item) => {
        const active = item.match(path);
        return (
          <Link
            key={item.label}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "group relative flex h-10 items-center gap-3.5 rounded-xl px-3.5 text-[15px] outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring",
              active
                ? "bg-accent font-semibold text-foreground"
                : "font-medium text-muted-foreground hover:bg-accent/60 hover:text-foreground",
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                "absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-brand transition-opacity duration-200",
                active ? "opacity-100" : "opacity-0",
              )}
            />
            <span
              className={cn(
                "relative shrink-0 transition-colors duration-150",
                active ? "text-brand" : "text-muted-foreground group-hover:text-foreground",
              )}
            >
              {item.icon}
              {!!item.badge && item.badge > 0 && (
                <span
                  className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[10px] font-bold text-white ring-2 ring-background"
                  aria-label={`${item.badge} unread`}
                >
                  {item.badge > 9 ? "9+" : item.badge}
                </span>
              )}
            </span>
            {item.label}
          </Link>
        );
      })}

      <div className="mt-auto" />
      <SearchLink />
    </nav>
  );
}

function SearchLink() {
  return (
    <Link
      href="#/explore"
      className="flex h-10 items-center gap-3.5 rounded-xl px-3.5 text-[15px] font-medium text-muted-foreground outline-none transition-colors duration-150 hover:bg-accent/60 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Search className="h-5 w-5" />
      Search KIVO
    </Link>
  );
}

function UserMenu() {
  const { user, signOut } = useSession();
  if (!user) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="flex w-full items-center gap-3 rounded-xl p-2 text-left outline-none transition-colors duration-150 hover:bg-accent/60 focus-visible:ring-2 focus-visible:ring-ring"
        aria-label="Account menu"
      >
        <UserAvatar
          username={user.profile.username}
          fullName={user.profile.fullName}
          avatarUrl={user.profile.avatarUrl}
          size={36}
          linkToProfile={false}
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold leading-tight">{user.profile.fullName}</p>
          <p className="truncate text-xs text-muted-foreground">@{user.profile.username}</p>
        </div>
        <ChevronsUpDown aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-60">
        <DropdownMenuLabel>
          <span className="block truncate">{user.profile.fullName}</span>
          <span className="block truncate text-xs font-normal text-muted-foreground">
            {user.email}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => navigateTo(`/profile/${user.profile.username}`)}>
          <UserIcon className="h-4 w-4" /> View profile
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => navigateTo("/settings")}>
          <Settings className="h-4 w-4" /> Settings
        </DropdownMenuItem>
        <ThemeToggleMenuItem />
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          onClick={async () => {
            await signOut();
            toast("Signed out. See you soon!");
            navigateTo("/login");
          }}
        >
          <LogOut className="h-4 w-4" /> Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function MobileTopBar({ path }: { path: string }) {
  const user = useSession((s) => s.user);
  const unread = useUnread();
  const title = getMobileTitle(path);
  return (
    <header className="glass sticky top-0 z-40 flex h-14 items-center justify-between border-b px-4 md:hidden">
      <Link href="#/" aria-label="KIVO home" className="outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg">
        <KivoBrand variant="compact" />
      </Link>
      <span className="absolute left-1/2 max-w-[10rem] -translate-x-1/2 truncate text-[15px] font-semibold tracking-tight">
        {title}
      </span>
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Search"
          className="h-10 w-10 rounded-full"
          onClick={() => navigateTo("/explore")}
        >
          <Search className="h-5 w-5" />
        </Button>
        {user && (
          <button
            className="relative flex h-10 w-10 items-center justify-center rounded-full outline-none transition-colors duration-150 hover:bg-accent/60 focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}
            onClick={() => navigateTo("/notifications")}
          >
            <span className="relative">
              <UserAvatar
                username={user.profile.username}
                fullName={user.profile.fullName}
                avatarUrl={user.profile.avatarUrl}
                size={32}
                linkToProfile={false}
              />
              {unread > 0 && (
                <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[10px] font-bold text-white ring-2 ring-background">
                  {unread > 9 ? "9+" : unread}
                </span>
              )}
            </span>
          </button>
        )}
      </div>
    </header>
  );
}

function getMobileTitle(path: string): string {
  if (path === "/") return "Home";
  const map: Record<string, string> = {
    "/explore": "Explore",
    "/spaces": "Spaces",
    "/saved": "Saved",
    "/notifications": "Notifications",
    "/settings": "Settings",
  };
  if (map[path]) return map[path];
  if (path.startsWith("/profile/")) return "Profile";
  if (path.startsWith("/spaces/")) return "Space";
  if (path.startsWith("/hashtag/")) return `#${decodeURIComponent(path.split("/")[2] ?? "")}`;
  if (path.startsWith("/saved/")) return "Collection";
  return "KIVO";
}

function MobileBottomNav({ path }: { path: string }) {
  const user = useSession((s) => s.user);
  const unread = useUnread();
  const openComposer = useComposer((s) => s.openComposer);
  const username = user?.profile.username ?? "";
  const items = [
    { label: "Home", icon: <Home className="h-[22px] w-[22px]" />, href: "#/", active: path === "/" },
    { label: "Explore", icon: <Compass className="h-[22px] w-[22px]" />, href: "#/explore", active: path.startsWith("/explore") },
    { label: "Notifications", icon: <Bell className="h-[22px] w-[22px]" />, href: "#/notifications", active: path.startsWith("/notifications"), badge: unread },
    { label: "Profile", icon: <UserIcon className="h-[22px] w-[22px]" />, href: `#/profile/${username}`, active: path.startsWith("/profile") },
  ];

  return (
    <nav
      aria-label="Mobile"
      className="glass fixed inset-x-0 bottom-0 z-40 flex h-[calc(4rem+env(safe-area-inset-bottom))] items-center justify-around border-t pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      {items.slice(0, 2).map((item) => (
        <BottomItem key={item.label} {...item} />
      ))}
      <button
        onClick={() => openComposer()}
        aria-label="Create post"
        className="brand-gradient -mt-6 flex h-13 w-13 items-center justify-center rounded-2xl text-white shadow-lg shadow-brand/30 outline-none transition-transform duration-150 hover:shadow-xl hover:shadow-brand/40 active:scale-95 focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Plus className="h-6 w-6" />
      </button>
      {items.slice(2).map((item) => (
        <BottomItem key={item.label} {...item} />
      ))}
    </nav>
  );
}

function BottomItem({
  label,
  icon,
  href,
  active,
  badge,
}: {
  label: string;
  icon: ReactNode;
  href: string;
  active: boolean;
  badge?: number;
}) {
  return (
    <Link
      href={href}
      aria-label={label}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative flex h-12 w-16 flex-col items-center justify-center gap-0.5 rounded-xl outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring",
        active ? "text-brand" : "text-muted-foreground",
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "absolute top-0.5 h-1 w-1 rounded-full bg-brand transition-opacity duration-150",
          active ? "opacity-100" : "opacity-0",
        )}
      />
      <span className="relative">
        {icon}
        {!!badge && badge > 0 && (
          <span className="absolute -right-2 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[10px] font-bold text-white ring-2 ring-background">
            {badge > 9 ? "9+" : badge}
          </span>
        )}
      </span>
      <span className={cn("text-[10px]", active ? "font-semibold" : "font-medium")}>{label}</span>
    </Link>
  );
}

/**
 * Authenticated app shell.
 * Desktop: sidebar + content (+ right rail on xl).
 * Mobile: top bar + content + bottom nav.
 */
export function AppShell({
  children,
  rightRail,
  path,
}: {
  children: ReactNode;
  rightRail?: ReactNode;
  path: string;
}) {
  return (
    <div className="flex min-h-svh flex-col">
      <MobileTopBar path={path} />
      <div className="flex flex-1">
        {/* Desktop sidebar */}
        <aside className="sticky top-0 hidden h-svh w-[240px] shrink-0 border-r md:block">
          <div className="flex h-full flex-col">
            <ScrollArea className="flex-1">
              <SidebarNav path={path} />
            </ScrollArea>
            <div className="border-t p-3">
              <UserMenu />
            </div>
          </div>
        </aside>

        {/* Main column */}
        <main className="flex min-w-0 flex-1 justify-center">
          <div className="flex w-full max-w-[640px] flex-col px-3 pb-28 pt-3 sm:px-6 md:px-8 md:pb-12 md:pt-6">
            <div className="flex flex-1 flex-col">{children}</div>
            <footer className="mt-auto hidden select-none items-center justify-center gap-2.5 pt-12 text-xs text-muted-foreground md:flex">
              <KivoBrand variant="icon" size={20} />
              <span className="tracking-wide">KIVO — Social, but cleaner.</span>
            </footer>
          </div>

          {/* Right rail (xl only) */}
          {rightRail && (
            <aside className="sticky top-0 hidden h-svh w-[340px] shrink-0 border-l px-6 py-6 xl:block">
              <div className="scrollbar-slim h-full overflow-y-auto">{rightRail}</div>
            </aside>
          )}
        </main>
      </div>
      <MobileBottomNav path={path} />
    </div>
  );
}
