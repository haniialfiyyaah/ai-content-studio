"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

export const PROJECT_TABS = [
  { id: "overview", label: "Overview" },
  { id: "content", label: "Content" },
  { id: "kit", label: "Creative Kit" },
  { id: "automation", label: "Automation" },
  { id: "publishing", label: "Publishing" },
  { id: "assets", label: "Assets" },
  { id: "activity", label: "Activity" },
] as const;

export type ProjectTabId = (typeof PROJECT_TABS)[number]["id"];

export function ProjectTabs({ projectId }: { projectId: string }) {
  const searchParams = useSearchParams();
  const active = (searchParams.get("tab") as ProjectTabId | null) ?? "overview";

  return (
    <nav
      className="flex gap-1 overflow-x-auto border-b border-border pb-px"
      aria-label="Project sections"
    >
      {PROJECT_TABS.map((tab) => {
        const isActive = active === tab.id;
        const href =
          tab.id === "overview"
            ? `/projects/${projectId}`
            : `/projects/${projectId}?tab=${tab.id}`;

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

export function resolveProjectTab(
  tabParam: string | string[] | undefined,
): ProjectTabId {
  const value = Array.isArray(tabParam) ? tabParam[0] : tabParam;
  const match = PROJECT_TABS.find((tab) => tab.id === value);
  return match?.id ?? "overview";
}
