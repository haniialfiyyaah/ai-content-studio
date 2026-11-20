import { Loader2 } from "lucide-react";

/** Inline spinner for pending buttons (keeps the label so the action stays clear). */
export function Spinner({ size = 14 }: { size?: number }) {
  return <Loader2 size={size} className="spin" aria-hidden />;
}
