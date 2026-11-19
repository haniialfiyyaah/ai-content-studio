import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { StatusPill } from "@/components/projects/status-pill";

interface AutomationRuleRow {
  id: string;
  kind: string;
  status: string;
  enabled: boolean;
  timezone: string;
  next_due_at: string | null;
  last_run_at: string | null;
  strategy: string | null;
  projects: { id: string; name: string } | null;
}

export default async function AutomationCenterPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data } = await supabase
    .from("automation_rules")
    .select(
      `
      id,
      kind,
      status,
      enabled,
      timezone,
      next_due_at,
      last_run_at,
      strategy,
      projects!inner(id, name)
    `,
    )
    .eq("owner_id", user!.id)
    .order("updated_at", { ascending: false });

  const rules = (data ?? []) as unknown as AutomationRuleRow[];

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <section className="studio-panel p-6 md:p-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.16em] text-accent">
              Automation
            </p>
            <h1 className="font-display mt-3 text-4xl tracking-tight">
              Automation Center
            </h1>
            <p className="mt-3 max-w-2xl text-sm text-muted">
              Project rules for ideation, publishing slots, notifications, and
              research. Pause or stop from the Project detail when needed.
            </p>
          </div>
          <Link
            href="/automation/runs"
            className="text-sm font-medium text-accent hover:underline"
          >
            View runs →
          </Link>
        </div>
      </section>

      <section className="studio-panel p-6 md:p-8">
        {rules.length === 0 ? (
          <div className="py-10 text-center">
            <h2 className="font-display text-2xl tracking-tight">
              No automation rules yet
            </h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted">
              Rules appear after a Project is Active and schedules are
              configured. Empty state is expected until then.
            </p>
            <Link
              href="/projects"
              className="mt-6 inline-block text-sm font-medium text-accent hover:underline"
            >
              Browse Projects
            </Link>
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {rules.map((rule) => (
              <li
                key={rule.id}
                className="flex flex-col gap-2 rounded-xl border border-border bg-surface-strong px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="font-medium capitalize">
                    {rule.kind.replaceAll("_", " ")}
                    {rule.strategy ? ` · ${rule.strategy}` : ""}
                  </p>
                  {rule.projects && (
                    <p className="mt-1 text-sm text-muted">
                      Project ·{" "}
                      <Link
                        href={`/projects/${rule.projects.id}`}
                        className="text-accent hover:underline"
                      >
                        {rule.projects.name}
                      </Link>
                    </p>
                  )}
                  <p className="mt-1 text-xs text-muted">
                    TZ {rule.timezone}
                    {rule.next_due_at
                      ? ` · next ${formatDate(rule.next_due_at)}`
                      : ""}
                    {rule.last_run_at
                      ? ` · last ${formatDate(rule.last_run_at)}`
                      : ""}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {!rule.enabled && (
                    <span className="text-xs text-muted">disabled</span>
                  )}
                  <StatusPill status={rule.status} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
