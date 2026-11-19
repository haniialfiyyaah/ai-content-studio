"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  CONTENT_TABS,
  type ContentTabId,
} from "@/lib/content-tabs";
import { cn } from "@/lib/utils";

export { CONTENT_TABS, type ContentTabId } from "@/lib/content-tabs";

export function ContentTabs({ conceptId }: { conceptId: string }) {
  const searchParams = useSearchParams();
  const active = (searchParams.get("tab") as ContentTabId | null) ?? "overview";

  return (
    <nav
      className="flex gap-1 overflow-x-auto border-b border-border pb-px"
      aria-label="Content sections"
    >
      {CONTENT_TABS.map((tab) => {
        const isActive = active === tab.id;
        const href =
          tab.id === "overview"
            ? `/content/${conceptId}`
            : `/content/${conceptId}?tab=${tab.id}`;

        return (
          <Link
            key={tab.id}
            href={href}
            className={cn(
              "shrink-0 rounded-t-lg px-3 py-2.5 text-sm font-medium transition studio-focus-ring",
              isActive
                ? "border-b-2 border-accent text-accent"
                : "text-muted hover:text-foreground",
            )}
            aria-current={isActive ? "page" : undefined}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
