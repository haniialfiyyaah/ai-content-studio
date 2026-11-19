"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Sparkles,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { MANAGE_NAV, WORKSPACE_NAV } from "./nav-config";

const SIDEBAR_KEY = "acs.sidebar.collapsed";

interface AppShellProps {
  children: React.ReactNode;
  userEmail?: string | null;
  displayName?: string | null;
}

export function AppShell({ children, userEmail, displayName }: AppShellProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem(SIDEBAR_KEY);
    if (stored === "1") setCollapsed(true);
  }, []);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      window.localStorage.setItem(SIDEBAR_KEY, next ? "1" : "0");
      return next;
    });
  }

  return (
    <div className="relative z-10 flex min-h-screen">
      {/* Desktop sidebar */}
      <aside
        className={cn(
          "sticky top-0 hidden h-screen shrink-0 flex-col bg-sidebar text-sidebar-foreground transition-[width] duration-300 ease-out md:flex",
          collapsed ? "w-[84px]" : "w-[260px]",
        )}
      >
        <div className="flex items-center justify-between gap-2 px-4 py-5">
          <Link href="/" className="flex min-w-0 items-center gap-2">
            <span className="flex size-9 items-center justify-center rounded-xl bg-accent text-accent-foreground">
              <Sparkles className="size-4" />
            </span>
            {!collapsed && (
              <span className="font-display text-lg tracking-tight">
                Content Studio
              </span>
            )}
          </Link>
          <button
            type="button"
            onClick={toggleCollapsed}
            className="studio-focus-ring rounded-lg p-2 text-sidebar-muted hover:bg-white/5 hover:text-sidebar-foreground"
            aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
          >
            {collapsed ? (
              <PanelLeftOpen className="size-4" />
            ) : (
              <PanelLeftClose className="size-4" />
            )}
          </button>
        </div>

        <div className="px-3">
          <Link
            href="/agent"
            className={cn(
              "flex items-center gap-2 rounded-xl bg-accent px-3 py-2.5 text-sm font-medium text-accent-foreground transition hover:brightness-110",
              collapsed && "justify-center px-0",
            )}
          >
            <Sparkles className="size-4 shrink-0" />
            {!collapsed && <span>Create with AI</span>}
          </Link>
        </div>

        <nav className="mt-6 flex flex-1 flex-col gap-6 overflow-y-auto px-3 pb-6">
          <NavGroup
            title="Workspace"
            items={WORKSPACE_NAV}
            pathname={pathname}
            collapsed={collapsed}
          />
          <NavGroup
            title="Manage"
            items={MANAGE_NAV}
            pathname={pathname}
            collapsed={collapsed}
          />
        </nav>

        <div className="border-t border-white/10 px-4 py-4 text-xs text-sidebar-muted">
          {!collapsed && (
            <p className="truncate">{displayName || userEmail || "Signed in"}</p>
          )}
        </div>
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            aria-label="Close navigation"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="relative z-10 flex h-full w-[280px] flex-col bg-sidebar text-sidebar-foreground shadow-2xl">
            <div className="flex items-center justify-between px-4 py-5">
              <span className="font-display text-lg">Content Studio</span>
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="rounded-lg p-2 text-sidebar-muted"
                aria-label="Close"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="px-3">
              <Link
                href="/agent"
                className="flex items-center gap-2 rounded-xl bg-accent px-3 py-2.5 text-sm font-medium text-accent-foreground"
              >
                <Sparkles className="size-4" />
                Create with AI
              </Link>
            </div>
            <nav className="mt-6 flex flex-col gap-6 px-3">
              <NavGroup title="Workspace" items={WORKSPACE_NAV} pathname={pathname} />
              <NavGroup title="Manage" items={MANAGE_NAV} pathname={pathname} />
            </nav>
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-border/70 bg-[rgba(247,243,236,0.8)] px-4 py-3 backdrop-blur-md md:px-8">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              onClick={() => setMobileOpen(true)}
              aria-label="Open navigation"
            >
              <Menu className="size-5" />
            </Button>
            <p className="text-sm text-muted">AI Content Studio</p>
          </div>
          <form action="/api/auth/logout" method="post">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={async () => {
                await fetch("/api/auth/logout", { method: "POST" });
                window.location.href = "/login";
              }}
            >
              Sign out
            </Button>
          </form>
        </header>
        <main className="flex-1 px-4 py-6 md:px-8 md:py-8">{children}</main>
      </div>
    </div>
  );
}

function NavGroup({
  title,
  items,
  pathname,
  collapsed = false,
}: {
  title: string;
  items: readonly { href: string; label: string }[];
  pathname: string;
  collapsed?: boolean;
}) {
  return (
    <div>
      {!collapsed && (
        <p className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-sidebar-muted">
          {title}
        </p>
      )}
      <ul className="flex flex-col gap-1">
        {items.map((item) => {
          const active =
            item.href === "/"
              ? pathname === "/"
              : pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                title={item.label}
                className={cn(
                  "block rounded-xl px-3 py-2 text-sm transition",
                  active
                    ? "bg-white/10 text-sidebar-foreground"
                    : "text-sidebar-muted hover:bg-white/5 hover:text-sidebar-foreground",
                  collapsed && "text-center px-2",
                )}
              >
                {collapsed ? item.label.slice(0, 1) : item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
