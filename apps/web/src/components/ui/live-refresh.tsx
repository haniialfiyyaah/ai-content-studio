"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";

export interface LiveSource {
  table: string;
  /** postgres_changes filter, e.g. `project_id=eq.<uuid>` */
  filter?: string;
}

/**
 * Re-renders the current server page when watched rows change (Supabase
 * Realtime; RLS limits the feed to the signed-in owner). No reloads needed.
 *
 * `pollMs` is a safety net while something is in flight (agent thinking,
 * generation, render): if a realtime event is missed, the page still updates.
 */
export function LiveRefresh({ sources, pollMs }: { sources: LiveSource[]; pollMs?: number }) {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const key = JSON.stringify(sources);

  useEffect(() => {
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;
    const refresh = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => router.refresh(), 500);
    };
    (async () => {
      // Realtime checks RLS with the user's JWT — set it before subscribing,
      // otherwise the channel joins as anon and owner-only rows never arrive.
      const { data } = await supabase.auth.getSession();
      if (data.session?.access_token) await supabase.realtime.setAuth(data.session.access_token);
      if (cancelled) return;
      channel = supabase.channel(`live:${key}`);
      for (const s of JSON.parse(key) as LiveSource[]) {
        channel.on("postgres_changes", { event: "*", schema: "public", table: s.table, ...(s.filter ? { filter: s.filter } : {}) }, refresh);
      }
      channel.subscribe();
    })();
    return () => {
      cancelled = true;
      if (timer.current) clearTimeout(timer.current);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [key, router]);

  useEffect(() => {
    if (!pollMs) return;
    const id = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, pollMs);
    return () => clearInterval(id);
  }, [pollMs, router]);

  return null;
}
