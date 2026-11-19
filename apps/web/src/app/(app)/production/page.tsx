import Link from "next/link";

const PRODUCTION_MODES = [
  {
    id: "remotion",
    title: "Remotion",
    body: "Deterministic composition renders from approved visual plans. Best for template-driven, brand-consistent shorts.",
  },
  {
    id: "fal",
    title: "fal.ai",
    body: "Generative video via fal adapters (fixture-first locally). Requires produce_paid_media authorization before spend.",
  },
  {
    id: "hybrid",
    title: "Hybrid",
    body: "Combines Remotion structure with fal generative shots and optional ElevenLabs narration. Highest cost path — consent first.",
  },
] as const;

export default function ProductionStudioPage() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <section className="studio-panel overflow-hidden p-6 md:p-10">
        <p className="text-sm font-medium uppercase tracking-[0.16em] text-accent">
          Production
        </p>
        <h1 className="font-display mt-3 max-w-2xl text-4xl tracking-tight md:text-5xl">
          Authorize renders from approved concepts.
        </h1>
        <p className="mt-4 max-w-xl text-sm text-muted md:text-base">
          Remotion, fal.ai, and Hybrid jobs only start after concept approval and
          an explicit{" "}
          <code className="rounded bg-black/5 px-1.5 py-0.5 text-xs">
            produce_paid_media
          </code>{" "}
          grant. Estimated cost is reserved before workers claim the job.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/content"
            className="inline-flex h-11 items-center rounded-xl bg-accent px-4 text-sm font-medium text-accent-foreground transition hover:brightness-110"
          >
            Browse concepts
          </Link>
          <Link
            href="/videos"
            className="inline-flex h-11 items-center rounded-xl border border-border bg-surface-strong px-4 text-sm font-medium transition hover:border-accent/40"
          >
            View video attempts
          </Link>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {PRODUCTION_MODES.map((mode) => (
          <article key={mode.id} className="studio-panel p-6">
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted">
              Mode
            </p>
            <h2 className="font-display mt-2 text-2xl tracking-tight">
              {mode.title}
            </h2>
            <p className="mt-3 text-sm text-muted">{mode.body}</p>
          </article>
        ))}
      </section>

      <section className="studio-panel p-6 md:p-8">
        <h2 className="font-display text-2xl tracking-tight">How it runs</h2>
        <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm text-muted">
          <li>Approve an immutable concept version.</li>
          <li>
            Call{" "}
            <code className="rounded bg-black/5 px-1.5 py-0.5 text-xs">
              POST /api/concept-versions/:id/render
            </code>{" "}
            with production mode + idempotency key.
          </li>
          <li>
            Workers claim via{" "}
            <code className="rounded bg-black/5 px-1.5 py-0.5 text-xs">
              /api/internal/jobs/*
            </code>{" "}
            and surface attempts in Videos for review.
          </li>
        </ol>
      </section>
    </div>
  );
}
