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

/** Pure tab resolver — safe to call from Server Components. */
export function resolveProjectTab(
  tabParam: string | string[] | undefined,
): ProjectTabId {
  const value = Array.isArray(tabParam) ? tabParam[0] : tabParam;
  const match = PROJECT_TABS.find((tab) => tab.id === value);
  return match?.id ?? "overview";
}
