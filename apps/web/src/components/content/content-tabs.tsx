"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

export const CONTENT_TABS = [
  { id: "overview", label: "Overview" },
  { id: "script", label: "Script" },
  { id: "storyboard", label: "Storyboard" },
  { id: "assets", label: "Assets" },
  { id: "publishing", label: "Publishing" },
  { id: "history", label: "History" },
] as const;

export type ContentTabId = (typeof CONTENT_TABS)[number]["id"];

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

export function resolveContentTab(
  tabParam: string | string[] | undefined,
): ContentTabId {
  const value = Array.isArray(tabParam) ? tabParam[0] : tabParam;
  const match = CONTENT_TABS.find((tab) => tab.id === value);
  return match?.id ?? "overview";
}
