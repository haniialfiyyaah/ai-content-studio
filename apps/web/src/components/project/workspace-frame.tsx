"use client";

import { useEffect, useState } from "react";
import { usePref } from "@/lib/client/use-pref";
import { MessageCircle } from "lucide-react";

/** Project workspace with a separately collapsible Agent panel (v2.7 nav rule). */
export function WorkspaceFrame({ agent, children, splitKey }: { agent: React.ReactNode; children: React.ReactNode; splitKey?: string }) {
  const [pref, setPref] = usePref("acs.agent", "open");
  const [splitIn, setSplitIn] = useState(false);
  // Coming from the full-page setup chat: slide the chat to the side once.
  useEffect(() => {
    if (!splitKey) return;
    try {
      const k = `acs.splitIn.${splitKey}`;
      if (sessionStorage.getItem(k)) {
        sessionStorage.removeItem(k);
        setSplitIn(true); // eslint-disable-line react-hooks/set-state-in-effect
        if (pref === "hidden") setPref("open");
      }
    } catch {}
  }, [splitKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const open = pref !== "hidden" || splitIn;
  const [mobile, setMobile] = useState<"project" | "chat">("project");

  const toggle = () => setPref(open ? "hidden" : "open");

  return (
    <>
      <div className="mobile-switch" style={{ display: "none" }} data-mobile-switch>
        <button className={`btn small ${mobile === "project" ? "soft" : ""}`} onClick={() => setMobile("project")}>Project</button>
        <button className={`btn small ${mobile === "chat" ? "soft" : ""}`} onClick={() => setMobile("chat")}>Agent</button>
      </div>
      <div className={`workspace mobile-${mobile} ${splitIn ? "split-in" : ""}`}>
        {open && agent}
        <div className="workspace-main">
          <div style={{ display: "flex", justifyContent: "flex-end", padding: "14px 28px 0" }}>
            <button className="btn soft small" onClick={toggle}><MessageCircle size={14} /> {open ? "Hide Agent" : "Open Agent"}</button>
          </div>
          {children}
        </div>
      </div>
    </>
  );
}
