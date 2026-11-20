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
 */
export function LiveRefresh({ sources }: { sources: LiveSource[] }) {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const key = JSON.stringify(sources);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase.channel(`live:${key}`);
    for (const s of JSON.parse(key) as LiveSource[]) {
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table: s.table, ...(s.filter ? { filter: s.filter } : {}) },
        () => {
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => router.refresh(), 700);
        },
      );
    }
    channel.subscribe();
    return () => {
      if (timer.current) clearTimeout(timer.current);
      void supabase.removeChannel(channel);
    };
  }, [key, router]);

  return null;
}
