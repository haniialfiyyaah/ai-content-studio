import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

const SECTIONS = [
  {
    href: "/settings/ai",
    title: "AI Providers",
    body: "Managed OpenAI or your own key. Connect, verify, replace, or disconnect.",
  },
  {
    href: "/publishing",
    title: "Connections",
    body: "Publishing destinations stay on the calendar until OAuth is authorized.",
  },
  {
    href: "/automation",
    title: "Automation",
    body: "Project rules and execution history. Nothing runs until a Project is Active.",
  },
] as const;

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <section className="studio-panel p-6 md:p-8">
        <p className="text-sm font-medium uppercase tracking-[0.16em] text-accent">
          Manage
        </p>
        <h1 className="font-display mt-3 text-4xl tracking-tight">Settings</h1>
        <p className="mt-3 max-w-2xl text-sm text-muted">
          Account, AI provider, and the places where connections and automation
          are actually configured.
        </p>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <article className="studio-panel p-6">
          <h2 className="font-display text-2xl tracking-tight">Account</h2>
          <p className="mt-2 text-sm text-muted">Signed in as</p>
          <p className="mt-1 text-sm font-medium">{user?.email ?? "Unknown"}</p>
        </article>
        <article className="studio-panel p-6">
          <h2 className="font-display text-2xl tracking-tight">Telegram</h2>
          <p className="mt-2 text-sm text-muted">
            Bot linking is not connected. No fictional chat history is shown.
          </p>
        </article>
        <article className="studio-panel p-6">
          <h2 className="font-display text-2xl tracking-tight">
            Budgets & usage
          </h2>
          <p className="mt-2 text-sm text-muted">
            Open AI Providers for the real allowance. Prototype credit numbers
            are not used here.
          </p>
        </article>
        <article className="studio-panel p-6">
          <h2 className="font-display text-2xl tracking-tight">Orchestration</h2>
          <p className="mt-2 text-sm text-muted">
            {process.env.N8N_WEBHOOK_BASE_URL?.trim()
              ? "Agent planning is sent to the n8n web gateway."
              : "Agent planning still runs in this app. The n8n drafts exist, but the webhook address is not set because this app is not reachable from n8n yet."}
          </p>
        </article>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {SECTIONS.map((section) => (
          <Link
            key={section.href}
            href={section.href}
            className="studio-panel p-6 transition hover:border-accent"
          >
            <h2 className="font-display text-xl tracking-tight">
              {section.title}
            </h2>
            <p className="mt-2 text-sm text-muted">{section.body}</p>
          </Link>
        ))}
      </section>
    </div>
  );
}
