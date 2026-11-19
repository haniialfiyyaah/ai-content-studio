export const CONTENT_TABS = [
  { id: "overview", label: "Overview" },
  { id: "script", label: "Script & Narration" },
  { id: "storyboard", label: "Storyboard & Scenes" },
  { id: "production", label: "Production" },
  { id: "assets", label: "Assets" },
  { id: "publishing", label: "Publishing Pack" },
  { id: "history", label: "Versions" },
] as const;

export type ContentTabId = (typeof CONTENT_TABS)[number]["id"];

/** Pure tab resolver — safe to call from Server Components. */
export function resolveContentTab(
  tabParam: string | string[] | undefined,
): ContentTabId {
  const value = Array.isArray(tabParam) ? tabParam[0] : tabParam;
  const match = CONTENT_TABS.find((tab) => tab.id === value);
  return match?.id ?? "overview";
}
