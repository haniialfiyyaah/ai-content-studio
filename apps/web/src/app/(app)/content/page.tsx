import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { StatusPill } from "@/components/projects/status-pill";

interface ConceptListRow {
  id: string;
  title: string | null;
  updated_at: string;
  project_id: string;
  latest_approved_version_id: string | null;
  projects: { id: string; name: string } | null;
  working: {
    review_status: string;
    version_number: number;
    approval_revoked_at: string | null;
  } | null;
}

export default async function ContentLibraryPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data } = await supabase
    .from("concepts")
    .select(
      `
      id,
      title,
      updated_at,
      project_id,
      latest_approved_version_id,
      projects!inner(id, name),
      working:concept_versions!concepts_working_version_id_fkey(
        review_status,
        version_number,
        approval_revoked_at
      )
    `,
    )
    .eq("owner_id", user!.id)
    .order("updated_at", { ascending: false });

  const list = (data ?? []) as unknown as ConceptListRow[];

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8">
      <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.16em] text-accent">
            Library
          </p>
          <h1 className="font-display mt-2 text-4xl tracking-tight md:text-5xl">
            Content
          </h1>
          <p className="mt-2 max-w-xl text-sm text-muted">
            Browse concepts across Projects — scripts, storyboards, and approval
            status in one place.
          </p>
        </div>
      </section>

      <section className="studio-panel p-6 md:p-8">
        {list.length === 0 ? (
          <div className="py-10 text-center">
            <h2 className="font-display text-2xl tracking-tight">
              No concepts yet
            </h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted">
              Concepts appear after the Creative Agent drafts them inside a
              Project.
            </p>
            <Link
              href="/agent"
              className="mt-6 inline-block text-sm font-medium text-accent hover:underline"
            >
              Open Creative Agent
            </Link>
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {list.map((concept) => {
              const status = resolveConceptStatus(concept);
              const project = concept.projects;

              return (
                <li key={concept.id}>
                  <div className="flex flex-col gap-2 rounded-xl border border-border bg-surface-strong px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <Link
                        href={`/content/${concept.id}`}
                        className="truncate font-medium transition hover:text-accent"
                      >
                        {concept.title?.trim() || "Untitled concept"}
                      </Link>
                      {project && (
                        <p className="mt-1 text-sm text-muted">
                          Project ·{" "}
                          <Link
                            href={`/projects/${project.id}`}
                            className="text-accent hover:underline"
                          >
                            {project.name}
                          </Link>
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <StatusPill status={status} />
                      <time
                        className="hidden text-xs text-muted sm:inline"
                        dateTime={concept.updated_at}
                      >
                        {formatDate(concept.updated_at)}
                      </time>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function resolveConceptStatus(concept: ConceptListRow): string {
  const working = concept.working;
  if (
    working?.review_status === "approved" &&
    !working.approval_revoked_at
  ) {
    return "approved";
  }
  if (concept.latest_approved_version_id && !working?.approval_revoked_at) {
    return working?.review_status ?? "approved";
  }
  return working?.review_status ?? "draft";
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
