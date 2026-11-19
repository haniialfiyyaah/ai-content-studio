import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { StatusPill } from "@/components/projects/status-pill";

interface AttemptListRow {
  id: string;
  attempt_number: number;
  status: string;
  provider: string | null;
  approved_at: string | null;
  approval_revoked_at: string | null;
  created_at: string;
  video_jobs: {
    id: string;
    project_id: string;
    production_mode: string;
    status: string;
  } | null;
}

export default async function VideosLibraryPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: jobs } = await supabase
    .from("video_jobs")
    .select("id")
    .eq("owner_id", user!.id);

  const jobIds = (jobs ?? []).map((j) => j.id);
  let attempts: AttemptListRow[] = [];

  if (jobIds.length > 0) {
    const { data } = await supabase
      .from("video_attempts")
      .select(
        "id, attempt_number, status, provider, approved_at, approval_revoked_at, created_at, video_jobs!inner(id, project_id, production_mode, status)",
      )
      .in("video_job_id", jobIds)
      .order("created_at", { ascending: false })
      .limit(50);

    attempts = (data ?? []) as unknown as AttemptListRow[];
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <section className="studio-panel p-6 md:p-8">
        <p className="text-sm font-medium uppercase tracking-[0.16em] text-accent">
          Library
        </p>
        <h1 className="font-display mt-3 text-4xl tracking-tight">Videos</h1>
        <p className="mt-3 max-w-2xl text-sm text-muted">
          Produced attempts across Projects — status, production mode, and
          review readiness.
        </p>
      </section>

      <section className="studio-panel p-6 md:p-8">
        {attempts.length === 0 ? (
          <p className="text-sm text-muted">
            No video attempts yet. Authorize paid media from an approved concept
            on the{" "}
            <Link href="/production" className="text-accent hover:underline">
              Production
            </Link>{" "}
            page.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {attempts.map((attempt) => {
              const job = attempt.video_jobs;
              return (
                <li key={attempt.id}>
                  <Link
                    href={`/videos/${attempt.id}`}
                    className="flex flex-col gap-2 rounded-xl border border-border bg-surface-strong px-4 py-3 transition hover:border-accent/40 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <p className="font-medium">
                        Attempt #{attempt.attempt_number}
                        {job ? ` · ${job.production_mode}` : null}
                      </p>
                      <p className="mt-1 text-xs text-muted">
                        {new Date(attempt.created_at).toLocaleString()}
                        {attempt.provider ? ` · ${attempt.provider}` : ""}
                        {attempt.approved_at && !attempt.approval_revoked_at
                          ? " · approved"
                          : ""}
                      </p>
                    </div>
                    <StatusPill status={attempt.status} />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
