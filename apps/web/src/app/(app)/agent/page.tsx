import { redirect } from "next/navigation";

/**
 * Retired — the Studio home (`/`) is now the single agent conversation
 * surface (web + Telegram share it). See apps/web/DESIGN.md.
 */
export default function CreativeAgentPage() {
  redirect("/");
}
