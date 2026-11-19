"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export interface ScheduleAttemptOption {
  id: string;
  attempt_number: number;
  label: string;
}

export interface ScheduleAccountOption {
  id: string;
  platform: string;
  display_name: string | null;
}

export function ScheduleForm({
  attempts,
  accounts,
}: {
  attempts: ScheduleAttemptOption[];
  accounts: ScheduleAccountOption[];
}) {
  const router = useRouter();
  const [videoAttemptId, setVideoAttemptId] = useState(attempts[0]?.id ?? "");
  const [connectedAccountId, setConnectedAccountId] = useState(
    accounts[0]?.id ?? "",
  );
  const [scheduledFor, setScheduledFor] = useState("");
  const [title, setTitle] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit =
    Boolean(videoAttemptId) &&
    Boolean(connectedAccountId) &&
    Boolean(scheduledFor) &&
    !pending;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;

    setPending(true);
    setError(null);

    try {
      const scheduledDate = new Date(scheduledFor);
      if (Number.isNaN(scheduledDate.getTime())) {
        setError("Enter a valid date and time.");
        return;
      }

      const res = await fetch("/api/publishing-jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          videoAttemptId,
          connectedAccountId,
          scheduledFor: scheduledDate.toISOString(),
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          metadataSnapshot: title.trim() ? { title: title.trim() } : {},
          idempotencyKey: crypto.randomUUID(),
        }),
      });

      const json = (await res.json()) as {
        status: string;
        error?: { message?: string } | null;
      };

      if (!res.ok || json.status === "error") {
        setError(json.error?.message ?? "Unable to create publishing job");
        return;
      }

      router.push("/publishing");
      router.refresh();
    } catch {
      setError("Network error. Try again.");
    } finally {
      setPending(false);
    }
  }

  if (attempts.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-surface-strong/50 px-5 py-10 text-center">
        <h2 className="font-display text-xl tracking-tight">
          No approved videos
        </h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted">
          Approve a video attempt before scheduling. Browse produced attempts in
          the{" "}
          <Link href="/videos" className="text-accent hover:underline">
            Videos library
          </Link>
          .
        </p>
      </div>
    );
  }

  if (accounts.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-surface-strong/50 px-5 py-10 text-center">
        <h2 className="font-display text-xl tracking-tight">
          No connected destinations
        </h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted">
          Connect a publishing account in Settings before scheduling a post.
        </p>
        <Link href="/settings" className="mt-6 inline-block">
          <Button variant="secondary">Open Settings</Button>
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={(event) => void onSubmit(event)} className="space-y-5">
      <Field label="Approved video">
        <select
          className="flex h-11 w-full rounded-xl border border-border bg-surface-strong px-3.5 text-sm studio-focus-ring"
          value={videoAttemptId}
          onChange={(event) => setVideoAttemptId(event.target.value)}
          required
        >
          {attempts.map((attempt) => (
            <option key={attempt.id} value={attempt.id}>
              {attempt.label}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Destination">
        <select
          className="flex h-11 w-full rounded-xl border border-border bg-surface-strong px-3.5 text-sm studio-focus-ring"
          value={connectedAccountId}
          onChange={(event) => setConnectedAccountId(event.target.value)}
          required
        >
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.platform}
              {account.display_name ? ` · ${account.display_name}` : ""}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Date & time">
        <Input
          type="datetime-local"
          value={scheduledFor}
          onChange={(event) => setScheduledFor(event.target.value)}
          required
        />
      </Field>

      <Field label="Post title">
        <Input
          type="text"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Optional title for the publishing pack"
          maxLength={200}
        />
      </Field>

      {error && <p className="text-sm text-danger">{error}</p>}

      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={!canSubmit}>
          {pending ? "Scheduling…" : "Schedule"}
        </Button>
        <Link href="/publishing">
          <Button type="button" variant="ghost">
            Cancel
          </Button>
        </Link>
      </div>
    </form>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block space-y-2">
      <span className="text-sm font-medium">{label}</span>
      {children}
    </label>
  );
}
