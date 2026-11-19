import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  ScheduleForm,
  type ScheduleAccountOption,
  type ScheduleAttemptOption,
} from "@/components/publishing/schedule-form";

interface AttemptJoinRow {
  id: string;
  attempt_number: number;
  status: string;
  approved_at: string | null;
  approval_revoked_at: string | null;
  video_jobs: {
    id: string;
    project_id: string;
    production_mode: string;
    projects: { id: string; name: string } | null;
  } | null;
}

export default async function ScheduleVideoPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: jobs } = await supabase
    .from("video_jobs")
    .select("id")
    .eq("owner_id", user!.id);

  const jobIds = (jobs ?? []).map((j) => j.id);
  let attempts: ScheduleAttemptOption[] = [];

  if (jobIds.length > 0) {
    const { data } = await supabase
      .from("video_attempts")
      .select(
        `
        id,
        attempt_number,
        status,
        approved_at,
        approval_revoked_at,
        video_jobs!inner(
          id,
          project_id,
          production_mode,
          projects(id, name)
        )
      `,
      )
      .in("video_job_id", jobIds)
      .eq("status", "approved")
      .is("approval_revoked_at", null)
      .not("approved_at", "is", null)
      .order("created_at", { ascending: false })
      .limit(50);

    const rows = (data ?? []) as unknown as AttemptJoinRow[];
    attempts = rows.map((row) => {
      const projectName = row.video_jobs?.projects?.name;
      const mode = row.video_jobs?.production_mode;
      return {
        id: row.id,
        attempt_number: row.attempt_number,
        label: [
          `Attempt #${row.attempt_number}`,
          mode,
          projectName,
        ]
          .filter(Boolean)
          .join(" · "),
      };
    });
  }

  const { data: accountsData } = await supabase
    .from("connected_accounts")
    .select("id, platform, display_name")
    .eq("owner_id", user!.id)
    .eq("status", "connected")
    .order("platform", { ascending: true });

  const accounts = (accountsData ?? []) as ScheduleAccountOption[];

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div>
        <Link
          href="/publishing"
          className="text-sm font-medium text-muted transition hover:text-accent"
        >
          ← Publishing calendar
        </Link>
      </div>

      <section className="studio-panel p-6 md:p-8">
        <p className="text-sm font-medium uppercase tracking-[0.16em] text-accent">
          Publishing
        </p>
        <h1 className="font-display mt-3 text-4xl tracking-tight">
          Schedule a video
        </h1>
        <p className="mt-3 max-w-2xl text-sm text-muted">
          Pick an approved attempt, destination, and time. Creates a draft
          publishing intent — no external post until the job is authorized and
          claimed.
        </p>

        <div className="mt-8">
          <ScheduleForm attempts={attempts} accounts={accounts} />
        </div>
      </section>
    </div>
  );
}
