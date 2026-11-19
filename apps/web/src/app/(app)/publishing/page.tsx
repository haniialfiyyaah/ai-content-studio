import { Suspense } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  MonthCalendar,
  type CalendarJob,
} from "@/components/publishing/month-calendar";

export default async function PublishingCalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string }>;
}) {
  const params = await searchParams;
  const now = new Date();
  const year = parsePositiveInt(params.year, now.getFullYear());
  const month = clamp(parsePositiveInt(params.month, now.getMonth() + 1), 1, 12);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data } = await supabase
    .from("publishing_jobs")
    .select(
      `
      id,
      status,
      scheduled_for,
      created_at,
      metadata_snapshot,
      connected_accounts(id, platform, display_name)
    `,
    )
    .eq("owner_id", user!.id)
    .order("created_at", { ascending: false })
    .limit(200);

  const jobs = ((data ?? []) as unknown as CalendarJob[]).filter((job) => {
    const when = job.scheduled_for ?? job.created_at;
    const date = new Date(when);
    if (Number.isNaN(date.getTime())) return false;
    // Match MonthCalendar local year/month bucketing.
    return date.getFullYear() === year && date.getMonth() + 1 === month;
  });

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <section className="studio-panel p-6 md:p-8">
        <p className="text-sm font-medium uppercase tracking-[0.16em] text-accent">
          Publishing
        </p>
        <h1 className="font-display mt-3 text-4xl tracking-tight">Calendar</h1>
        <p className="mt-3 max-w-2xl text-sm text-muted">
          Month view of scheduled publishing intents.{" "}
          <Link href="/publishing/schedule" className="font-medium text-accent">
            Open the schedule composer
          </Link>{" "}
          after a video is approved.
        </p>
      </section>

      <section className="studio-panel p-6 md:p-8">
        <Suspense fallback={<p className="text-sm text-muted">Loading calendar…</p>}>
          <MonthCalendar year={year} month={month} jobs={jobs} />
        </Suspense>
      </section>
    </div>
  );
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
