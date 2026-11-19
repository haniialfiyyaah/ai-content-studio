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
    <div className="app-shell">
      <aside
        className={cn("app-sidebar", collapsed && "is-collapsed")}
      >
        <div className="app-sidebar-header">
          <Link href="/" className="app-brand">
            <span className="app-brand-mark">
              <Sparkles className="size-4" />
            </span>
            {!collapsed && <span className="app-brand-name">Content Studio</span>}
          </Link>
          <button
            type="button"
            onClick={toggleCollapsed}
            className="app-sidebar-toggle studio-focus-ring"
            aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
          >
            {collapsed ? (
              <PanelLeftOpen className="size-4" />
            ) : (
              <PanelLeftClose className="size-4" />
            )}
          </button>
        </div>

        <div className="app-sidebar-cta-wrap">
          <Link
            href="/agent"
            className={cn("app-sidebar-cta", collapsed && "is-collapsed")}
          >
            <Sparkles className="size-4 shrink-0" />
            {!collapsed && <span>Create with AI</span>}
          </Link>
        </div>

        <nav className="app-sidebar-nav">
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

        <div className="app-sidebar-footer">
          {!collapsed && (
            <p>{displayName || userEmail || "Signed in"}</p>
          )}
        </div>
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden" style={{ position: "fixed", inset: 0, zIndex: 40 }}>
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.4)", border: 0 }}
            aria-label="Close navigation"
            onClick={() => setMobileOpen(false)}
          />
          <aside
            className="app-sidebar"
            style={{ display: "flex", position: "relative", zIndex: 10, width: 280 }}
          >
            <div className="app-sidebar-header">
              <span className="app-brand-name">Content Studio</span>
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="app-sidebar-toggle"
                aria-label="Close"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="app-sidebar-cta-wrap">
              <Link href="/agent" className="app-sidebar-cta">
                <Sparkles className="size-4" />
                Create with AI
              </Link>
            </div>
            <nav className="app-sidebar-nav">
              <NavGroup title="Workspace" items={WORKSPACE_NAV} pathname={pathname} />
              <NavGroup title="Manage" items={MANAGE_NAV} pathname={pathname} />
            </nav>
          </aside>
        </div>
      )}

      <div className="app-main-column">
        <header className="app-topbar">
          <div className="app-topbar-left">
            <Button
              variant="ghost"
              size="icon"
              className="studio-button-ghost md:hidden"
              onClick={() => setMobileOpen(true)}
              aria-label="Open navigation"
            >
              <Menu className="size-5" />
            </Button>
            <p className="app-topbar-label">AI Content Studio</p>
          </div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="studio-button-secondary"
            onClick={async () => {
              await fetch("/api/auth/logout", { method: "POST" });
              window.location.href = "/login";
            }}
          >
            Sign out
          </Button>
        </header>
        <main className="app-content">{children}</main>
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
      {!collapsed && <p className="app-nav-group-title">{title}</p>}
      <ul className="app-nav-list">
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
                  "app-nav-link",
                  active && "is-active",
                  collapsed && "is-collapsed",
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
