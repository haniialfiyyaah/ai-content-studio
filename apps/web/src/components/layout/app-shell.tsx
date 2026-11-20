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

function Sidebar({ name, collapsed, onNavigate }: { name: string; collapsed?: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  const item = (n: (typeof ALL)[number]) => (
    <Link key={n.href} href={n.href} onClick={onNavigate} className={`navitem ${isActive(pathname, n.href) ? "active" : ""}`} title={n.label}>
      <n.icon /> <span className="navlabel">{n.label}</span>
    </Link>
  );
  return (
    <aside className={`sidebar ${collapsed ? "collapsed" : ""}`}>
      <div className="brand">
        <div className="brandmark"><Sparkles size={18} /></div>
        <div>
          <strong>AI Content Studio</strong>
          <small>YOUR CREATIVE WORKSPACE</small>
        </div>
      </div>
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
  const [nav, setNav] = usePref("acs.nav", "open");
  const collapsed = nav === "collapsed";
  const [drawer, setDrawer] = useState(false);

  function toggle() {
    if (window.matchMedia("(max-width: 850px)").matches) return setDrawer(true);
    setNav(collapsed ? "open" : "collapsed");
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  const section = ALL.find((n) => isActive(pathname, n.href))?.label ?? "Studio";

  return (
    <div className="shell">
      <Sidebar name={name} collapsed={collapsed} />
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
            <button className="icbtn" onClick={toggle} aria-label="Toggle navigation"><Menu size={17} /></button>
            <div className="crumb">Studio / <strong>{section}</strong></div>
          </div>
          <div className="topR">
            <Link href="/#create" className="btn soft small"><Sparkles size={14} /> Agent</Link>
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
