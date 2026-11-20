"use client";

import { useState } from "react";
import { usePref } from "@/lib/client/use-pref";
import { MessageCircle } from "lucide-react";

/** Project workspace with a separately collapsible Agent panel (v2.7 nav rule). */
export function WorkspaceFrame({ agent, children }: { agent: React.ReactNode; children: React.ReactNode }) {
  const [pref, setPref] = usePref("acs.agent", "open");
  const open = pref !== "hidden";
  const [mobile, setMobile] = useState<"project" | "chat">("project");

  const toggle = () => setPref(open ? "hidden" : "open");

  return (
    <>
      <div className="mobile-switch" style={{ display: "none" }} data-mobile-switch>
        <button className={`btn small ${mobile === "project" ? "soft" : ""}`} onClick={() => setMobile("project")}>Project</button>
        <button className={`btn small ${mobile === "chat" ? "soft" : ""}`} onClick={() => setMobile("chat")}>Agent</button>
      </div>
      <div className={`workspace mobile-${mobile}`}>
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
