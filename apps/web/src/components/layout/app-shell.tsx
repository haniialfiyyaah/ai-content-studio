"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Bolt,
  Calendar,
  Clapperboard,
  FileText,
  Folder,
  Images,
  LayoutGrid,
  LogOut,
  Menu,
  MessageCircle,
  Settings,
  Sparkles,
  X,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { MANAGE_NAV, WORKSPACE_NAV } from "./nav-config";

const NAV_ICONS: Record<string, LucideIcon> = {
  "/": MessageCircle,
  "/projects": Folder,
  "/content": FileText,
  "/videos": Clapperboard,
  "/publishing": Calendar,
  "/automation": Bolt,
  "/library": Images,
  "/settings": Settings,
};

const RAIL_ITEMS = [...WORKSPACE_NAV, ...MANAGE_NAV].filter(
  (item) => item.href !== "/settings",
);

const MOBILE_TABS = [
  { href: "/", label: "Studio", icon: MessageCircle },
  { href: "/projects", label: "Projects", icon: Folder },
  { href: "/content", label: "Content", icon: FileText },
  { href: "/publishing", label: "Publishing", icon: Calendar },
] as const;

function isActive(pathname: string, href: string): boolean {
  return href === "/"
    ? pathname === "/"
    : pathname === href || pathname.startsWith(`${href}/`);
}

interface AppShellProps {
  children: React.ReactNode;
  userEmail?: string | null;
  displayName?: string | null;
}

export function AppShell({ children, userEmail, displayName }: AppShellProps) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  const who = displayName || userEmail || "Signed in";
  const initial = who.trim().charAt(0).toUpperCase() || "S";
  // Studio home owns its own full-height layout; other screens get page padding.
  const flush = pathname === "/";

  return (
    <div className="app-shell">
      <nav className="app-rail" aria-label="Main">
        <Link href="/" className="app-rail-brand" aria-label="AI Content Studio">
          <span className="brand-mark">
            <Sparkles className="size-5" aria-hidden />
          </span>
        </Link>
        <ul className="app-rail-list">
          {RAIL_ITEMS.map((item) => {
            const Icon = NAV_ICONS[item.href] ?? LayoutGrid;
            const active = isActive(pathname, item.href);
            const label = item.href === "/" ? "Studio" : item.label;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn("rail-link", active && "is-active")}
                  aria-label={label}
                  aria-current={active ? "page" : undefined}
                  data-label={label}
                >
                  <Icon className="size-5" aria-hidden />
                </Link>
              </li>
            );
          })}
        </ul>
        <div className="app-rail-bottom">
          <Link
            href="/settings"
            className={cn("rail-link", isActive(pathname, "/settings") && "is-active")}
            aria-label="Settings"
            aria-current={isActive(pathname, "/settings") ? "page" : undefined}
            data-label="Settings"
          >
            <Settings className="size-5" aria-hidden />
          </Link>
          <button
            type="button"
            className="rail-link"
            onClick={() => void signOut()}
            aria-label="Sign out"
            data-label="Sign out"
          >
            <LogOut className="size-5" aria-hidden />
          </button>
          <span className="rail-avatar" title={who} aria-label={`Signed in as ${who}`}>
            {initial}
          </span>
        </div>
      </nav>

      <div className="app-main-column">
        <header className="app-mobilebar">
          <span className="app-mobilebar-title">
            <span className="brand-mark">
              <Sparkles className="size-5" aria-hidden />
            </span>
            AI Content Studio
          </span>
          <button
            type="button"
            className="studio-button-ghost"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open navigation"
          >
            <Menu className="size-5" />
          </button>
        </header>
        <main className={cn("app-content", flush && "is-flush")}>{children}</main>
      </div>

      <nav className="app-tabbar" aria-label="Quick">
        {MOBILE_TABS.map((tab) => {
          const Icon = tab.icon;
          const active = isActive(pathname, tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn("app-tab", active && "is-active")}
              aria-current={active ? "page" : undefined}
            >
              <Icon className="size-5" aria-hidden />
              {tab.label}
            </Link>
          );
        })}
        <button
          type="button"
          className="app-tab"
          onClick={() => setDrawerOpen(true)}
          aria-label="Open all navigation"
        >
          <Menu className="size-5" aria-hidden />
          More
        </button>
      </nav>

      {drawerOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <button
            type="button"
            className="absolute inset-0 border-0 bg-black/30"
            aria-label="Close navigation"
            onClick={() => setDrawerOpen(false)}
          />
          <aside
            className="absolute inset-y-0 right-0 flex w-72 flex-col gap-4 bg-white p-4"
            aria-label="Navigation"
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold">{who}</span>
              <button
                type="button"
                className="studio-button-ghost"
                onClick={() => setDrawerOpen(false)}
                aria-label="Close navigation"
              >
                <X className="size-5" />
              </button>
            </div>
            <ul className="drawer-nav">
              {[...WORKSPACE_NAV, ...MANAGE_NAV].map((item) => {
                const Icon = NAV_ICONS[item.href] ?? LayoutGrid;
                const active = isActive(pathname, item.href);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={cn("drawer-link", active && "is-active")}
                      aria-current={active ? "page" : undefined}
                    >
                      <Icon className="size-5" aria-hidden />
                      {item.href === "/" ? "Studio" : item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
            <button
              type="button"
              className="secondary-button mt-auto"
              onClick={() => void signOut()}
            >
              <LogOut className="size-4" aria-hidden />
              Sign out
            </button>
          </aside>
        </div>
      )}
    </div>
  );
}
