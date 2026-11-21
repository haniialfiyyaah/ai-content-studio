/** Pre-fills the agent chat input from anywhere on the page (chat inputs listen for "acs:compose"). */
export function compose(text: string) {
  window.dispatchEvent(new CustomEvent("acs:compose", { detail: text }));
}
