"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { usePref } from "@/lib/client/use-pref";
import {
  Bell,
  CalendarDays,
  FileText,
  Film,
  Folder,
  Images,
  LayoutGrid,
  LogOut,
  Menu,
  Settings,
  Sparkles,
  Zap,
} from "lucide-react";

const WORKSPACE = [
  { href: "/", label: "Overview", icon: LayoutGrid },
  { href: "/projects", label: "Projects", icon: Folder },
  { href: "/content", label: "Content", icon: FileText },
  { href: "/videos", label: "Videos", icon: Film },
];
const MANAGE = [
  { href: "/publishing", label: "Publishing", icon: CalendarDays },
  { href: "/automation", label: "Automation", icon: Zap },
  { href: "/library", label: "Library", icon: Images },
  { href: "/settings", label: "Settings", icon: Settings },
];
const ALL = [...WORKSPACE, ...MANAGE];

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

function initials(name: string) {
  return name.split(/[\s@._-]+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("") || "ME";
}

function Sidebar({
  name,
  className = "",
  onNavigate,
  onMouseLeave,
}: {
  name: string;
  className?: string;
  onNavigate?: () => void;
  onMouseLeave?: () => void;
}) {
  const pathname = usePathname();
  const item = (n: (typeof ALL)[number]) => (
    <Link key={n.href} href={n.href} onClick={onNavigate} className={`navitem ${isActive(pathname, n.href) ? "active" : ""}`} title={n.label}>
      <n.icon /> <span className="navlabel">{n.label}</span>
    </Link>
  );
  return (
    <aside className={`sidebar ${className}`} onMouseLeave={onMouseLeave}>
      <Link href="/" onClick={onNavigate} className="brand" style={{ textDecoration: "none", color: "inherit" }} aria-label="Home">
        <div className="brandmark"><Sparkles size={18} /></div>
        <div>
          <strong>AI Content Studio</strong>
          <small>YOUR CREATIVE WORKSPACE</small>
        </div>
      </Link>
      <Link href="/#create" onClick={onNavigate} className="newbtn"><Sparkles size={15} /> <span>Create with AI</span></Link>
      <div className="navtitle">WORKSPACE</div>
      {WORKSPACE.map(item)}
      <div className="navtitle">MANAGE</div>
      {MANAGE.map(item)}
      <div className="sidebottom">
        <span className="avatar">{initials(name)}</span>
        <div style={{ minWidth: 0 }}>
          <div className="small semibold" style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{name}</div>
          <div className="tiny muted">Personal workspace</div>
        </div>
      </div>
    </aside>
  );
}

export function AppShell({ name, children }: { name: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  // "auto" (default): hidden, slides in when the pointer reaches the left edge,
  // closes when it leaves. "pinned": always visible. Mobile: drawer.
  const [nav, setNav] = usePref("acs.nav.v2", "auto");
  const pinned = nav === "pinned";
  const [hover, setHover] = useState(false);
  const [drawer, setDrawer] = useState(false);

  function toggle() {
    if (window.matchMedia("(max-width: 850px)").matches) return setDrawer(true);
    setHover(false);
    setNav(pinned ? "auto" : "pinned");
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  const section = ALL.find((n) => isActive(pathname, n.href))?.label ?? "Studio";

  return (
    <div className="shell">
      {pinned ? (
        <Sidebar name={name} />
      ) : (
        <>
          <div className="nav-hotzone" onMouseEnter={() => setHover(true)} aria-hidden />
          <Sidebar
            name={name}
            className={`auto ${hover ? "open" : ""}`}
            onNavigate={() => setHover(false)}
            onMouseLeave={() => setHover(false)}
          />
        </>
      )}
      {drawer && (
        <div className="mobile-drawer" onClick={() => setDrawer(false)}>
          <div onClick={(e) => e.stopPropagation()}>
            <Sidebar name={name} onNavigate={() => setDrawer(false)} />
          </div>
        </div>
      )}
      <div className="app">
        <header className="topbar">
          <div className="topL">
            <button
              className={`icbtn ${pinned ? "on" : ""}`}
              onClick={toggle}
              onMouseEnter={() => !pinned && setHover(true)}
              aria-label={pinned ? "Unpin navigation" : "Pin navigation"}
              title={pinned ? "Unpin navigation (auto-hide)" : "Pin navigation open"}
            >
              <Menu size={17} />
            </button>
            <Link href="/" className="brandmark small" aria-label="Home" title="Home"><Sparkles size={14} /></Link>
            <div className="crumb"><Link href="/" style={{ color: "inherit", textDecoration: "none" }}>Studio</Link> / <strong>{section}</strong></div>
          </div>
          <div className="topR">
            <Link
              href="/#create"
              className="btn soft small"
              onClick={(e) => {
                // In a project the agent chat is on screen: jump into its text box instead of leaving.
                const box = document.getElementById("agent-input") as HTMLTextAreaElement | null;
                if (box) {
                  e.preventDefault();
                  box.scrollIntoView({ block: "center", behavior: "smooth" });
                  box.focus();
                }
              }}
            >
              <Sparkles size={14} /> Agent
            </Link>
            <Link href="/automation" className="icbtn" aria-label="Activity"><Bell size={16} /></Link>
            <button className="icbtn" onClick={logout} aria-label="Sign out" title="Sign out"><LogOut size={16} /></button>
            <span className="avatar">{initials(name)}</span>
          </div>
        </header>
        {children}
      </div>
    </div>
  );
}
