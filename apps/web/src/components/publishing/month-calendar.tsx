"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/projects/status-pill";
import { cn } from "@/lib/utils";

export interface CalendarJob {
  id: string;
  status: string;
  scheduled_for: string | null;
  created_at: string;
  metadata_snapshot: { title?: string } | null;
  connected_accounts: {
    id: string;
    platform: string;
    display_name: string | null;
  } | null;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export function MonthCalendar({
  year,
  month,
  jobs,
}: {
  year: number;
  month: number;
  jobs: CalendarJob[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const { daysInMonth, startWeekday, label } = useMemo(() => {
    const first = new Date(year, month - 1, 1);
    const last = new Date(year, month, 0);
    return {
      daysInMonth: last.getDate(),
      startWeekday: first.getDay(),
      label: first.toLocaleString(undefined, { month: "long", year: "numeric" }),
    };
  }, [year, month]);

  const jobsByDay = useMemo(() => {
    const map = new Map<number, CalendarJob[]>();
    for (const job of jobs) {
      const when = job.scheduled_for ?? job.created_at;
      const date = new Date(when);
      if (
        date.getFullYear() === year &&
        date.getMonth() + 1 === month
      ) {
        const day = date.getDate();
        const list = map.get(day) ?? [];
        list.push(job);
        map.set(day, list);
      }
    }
    return map;
  }, [jobs, year, month]);

  function go(delta: number) {
    const next = new Date(year, month - 1 + delta, 1);
    const params = new URLSearchParams(searchParams.toString());
    params.set("year", String(next.getFullYear()));
    params.set("month", String(next.getMonth() + 1));
    router.push(`/publishing?${params.toString()}`);
  }

  const cells: Array<{ day: number | null }> = [];
  for (let i = 0; i < startWeekday; i += 1) {
    cells.push({ day: null });
  }
  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push({ day });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Button variant="secondary" size="sm" onClick={() => go(-1)}>
            Previous
          </Button>
          <h2 className="font-display text-2xl tracking-tight">{label}</h2>
          <Button variant="secondary" size="sm" onClick={() => go(1)}>
            Next
          </Button>
        </div>
        <Link href="/publishing/schedule">
          <Button>Schedule a video</Button>
        </Link>
      </div>

      <div className="overflow-x-auto">
        <div className="grid min-w-[640px] grid-cols-7 gap-px rounded-xl border border-border bg-border">
          {WEEKDAYS.map((day) => (
            <div
              key={day}
              className="bg-surface-strong px-2 py-2 text-center text-xs font-medium uppercase tracking-wide text-muted"
            >
              {day}
            </div>
          ))}
          {cells.map((cell, index) => {
            const dayJobs = cell.day ? jobsByDay.get(cell.day) ?? [] : [];
            return (
              <div
                key={`${cell.day ?? "empty"}-${index}`}
                className={cn(
                  "min-h-24 bg-surface-strong p-2",
                  cell.day === null && "bg-surface/60",
                )}
              >
                {cell.day !== null && (
                  <>
                    <p className="text-xs font-medium text-muted">{cell.day}</p>
                    <ul className="mt-1 space-y-1">
                      {dayJobs.slice(0, 3).map((job) => (
                        <li
                          key={job.id}
                          className="truncate rounded-md bg-accent-soft px-1.5 py-0.5 text-[10px] font-medium text-accent"
                          title={jobTitle(job)}
                        >
                          {jobTitle(job)}
                        </li>
                      ))}
                      {dayJobs.length > 3 && (
                        <li className="text-[10px] text-muted">
                          +{dayJobs.length - 3} more
                        </li>
                      )}
                    </ul>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div>
        <h3 className="font-display text-xl tracking-tight">
          Jobs this month
        </h3>
        {jobs.length === 0 ? (
          <p className="mt-3 text-sm text-muted">
            No publishing jobs scheduled for {label}.
          </p>
        ) : (
          <ul className="mt-3 flex flex-col gap-3">
            {jobs.map((job) => (
              <li
                key={job.id}
                className="flex flex-col gap-2 rounded-xl border border-border bg-surface-strong px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{jobTitle(job)}</p>
                  <p className="mt-1 text-xs text-muted">
                    {job.connected_accounts
                      ? `${job.connected_accounts.platform}${
                          job.connected_accounts.display_name
                            ? ` · ${job.connected_accounts.display_name}`
                            : ""
                        }`
                      : "No destination"}
                    {" · "}
                    {formatWhen(job.scheduled_for ?? job.created_at)}
                  </p>
                </div>
                <StatusPill status={job.status} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function jobTitle(job: CalendarJob): string {
  const title = job.metadata_snapshot?.title?.trim();
  return title || `Job ${job.id.slice(0, 8)}`;
}

function formatWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
