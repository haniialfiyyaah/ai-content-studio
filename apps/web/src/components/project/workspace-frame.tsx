"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { MessageCircle } from "lucide-react";
import { usePref } from "@/lib/client/use-pref";

/** Lets the agent panel hide itself from its own header. */
const AgentFrame = createContext<{ hide: () => void } | null>(null);
export const useAgentFrame = () => useContext(AgentFrame);

/** Project workspace: agent chat + main area. Desktop: hideable side panel. Phone: Chat / Project switch. */
export function WorkspaceFrame({ agent, children, splitKey }: { agent: React.ReactNode; children: React.ReactNode; splitKey?: string }) {
  const [pref, setPref] = usePref("acs.agent", "open");
  const [splitIn, setSplitIn] = useState(false);
  const [mobile, setMobile] = useState<"project" | "chat">("project");
  // Coming from the setup chat: slide the chat to the side once.
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

  return (
    <AgentFrame.Provider value={{ hide: () => setPref("hidden") }}>
      <div className="mobile-switch" data-mobile-switch>
        <button className={`btn small ${mobile === "project" ? "soft" : "ghost"}`} onClick={() => setMobile("project")}>Project</button>
        <button className={`btn small ${mobile === "chat" ? "soft" : "ghost"}`} onClick={() => setMobile("chat")}>Agent</button>
      </div>
      <div className={`workspace mobile-${mobile} ${splitIn ? "split-in" : ""} ${open ? "" : "agent-hidden"}`}>
        {agent}
        <div className="workspace-main">
          {!open && (
            <button className="btn soft small open-agent" onClick={() => setPref("open")}><MessageCircle size={14} /> Open Agent</button>
          )}
          {children}
        </div>
      </div>
    </AgentFrame.Provider>
  );
}
