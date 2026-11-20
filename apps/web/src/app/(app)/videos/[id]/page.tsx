import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { VideoReviewActions } from "@/components/videos/video-review-actions";

/**
 * Video review — loads attempt + signed render URL when an output asset exists.
 */
export default async function VideoReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?next=${encodeURIComponent(`/videos/${id}`)}`);
  }

  const { data: attempt } = await supabase
    .from("video_attempts")
    .select(
      "id, status, provider, model_id, output_asset_id, approved_at, approval_revoked_at, error_code, error_details, video_job_id, created_at",
    )
    .eq("id", id)
    .maybeSingle();

  if (!attempt) {
    // Allow looking up by job id as a convenience.
    const { data: job } = await supabase
      .from("video_jobs")
      .select("id, status, production_mode")
      .eq("id", id)
      .maybeSingle();

    if (job) {
      const { data: latest } = await supabase
        .from("video_attempts")
        .select(
          "id, status, provider, model_id, output_asset_id, approved_at, approval_revoked_at, error_code, error_details, video_job_id, created_at",
        )
        .eq("video_job_id", job.id)
        .order("attempt_number", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (latest) {
        return <ReviewBody attempt={latest} />;
      }
    }

    // RLS hides other owners' attempts as "missing" — avoid a blank 404.
    return (
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <section className="studio-panel p-6 md:p-8">
          <p className="text-sm font-medium uppercase tracking-[0.16em] text-accent">
            Video review
          </p>
          <h1 className="font-display mt-3 text-3xl tracking-tight">
            Video not available
          </h1>
          <p className="mt-3 max-w-xl text-sm text-muted">
            This attempt is missing, still rendering, or belongs to another
            account. Open your library or produce a new render from an approved
            concept.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/videos"
              className="inline-flex h-11 items-center rounded-xl bg-accent px-4 text-sm font-medium text-accent-foreground transition hover:brightness-110"
            >
              Videos library
            </Link>
            <Link
              href="/"
              className="inline-flex h-11 items-center rounded-xl border border-border bg-surface-strong px-4 text-sm font-medium transition hover:border-accent/40"
            >
              Studio
            </Link>
          </div>
        </section>
      </div>
    );
  }

  return <ReviewBody attempt={attempt} />;
}

async function ReviewBody({
  attempt,
}: {
  attempt: {
    id: string;
    status: string;
    provider: string | null;
    model_id: string | null;
    output_asset_id: string | null;
    approved_at: string | null;
    approval_revoked_at: string | null;
    error_code: string | null;
    error_details?: unknown;
    video_job_id: string;
    created_at: string;
  };
}) {
  let signedUrl: string | null = null;
  let assetMeta: {
    storage_path: string;
    mime_type: string | null;
    size_bytes: number | null;
    provider: string | null;
  } | null = null;

  if (attempt.output_asset_id) {
    const admin = createAdminClient();
    const { data: asset } = await admin
      .from("media_assets")
      .select("storage_bucket, storage_path, mime_type, size_bytes, provider")
      .eq("id", attempt.output_asset_id)
      .maybeSingle();

    if (asset) {
      assetMeta = {
        storage_path: asset.storage_path,
        mime_type: asset.mime_type,
        size_bytes: asset.size_bytes,
        provider: asset.provider,
      };
      const { data: signed } = await admin.storage
        .from(asset.storage_bucket)
        .createSignedUrl(asset.storage_path, 3600);
      signedUrl = signed?.signedUrl ?? null;
    }
  }

  const awaitingBrowser =
    !attempt.output_asset_id &&
    typeof attempt.error_details === "object" &&
    attempt.error_details !== null &&
    (attempt.error_details as { awaitingBrowser?: boolean }).awaitingBrowser === true;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <div>
        <Link
          href="/videos"
          className="text-sm font-medium text-muted transition hover:text-accent"
        >
          ← Videos
        </Link>
      </div>

      <section className="studio-panel p-6 md:p-8">
        <p className="text-sm font-medium uppercase tracking-[0.16em] text-accent">
          Video review
        </p>
        <h1 className="font-display mt-3 text-3xl tracking-tight md:text-4xl">
          Attempt {attempt.id.slice(0, 8)}
        </h1>
        <p className="mt-2 text-sm text-muted">
          Status <span className="font-medium text-foreground">{attempt.status}</span>
          {attempt.provider ? ` · ${attempt.provider}` : ""}
          {attempt.model_id ? ` · ${attempt.model_id}` : ""}
        </p>

        {signedUrl ? (
          <video
            controls
            src={signedUrl}
            className="mt-6 w-full max-w-sm rounded-2xl bg-black"
          />
        ) : (
          <p className="mt-6 max-w-xl text-sm text-muted">
            {awaitingBrowser
              ? "Awaiting a browser-initiated export — open Content → Production and run “Export MP4 in browser” to finish this render."
              : attempt.output_asset_id
                ? "Output asset exists but a signed URL could not be created."
                : "No rendered output yet. Open Content → Production and export an MP4 in the browser, or queue a fal.ai render for unattended completion."}
          </p>
        )}

        {assetMeta ? (
          <p className="mt-3 text-xs text-muted">
            {assetMeta.storage_path}
            {assetMeta.size_bytes != null
              ? ` · ${(assetMeta.size_bytes / 1024).toFixed(1)} KB`
              : ""}
          </p>
        ) : null}

        {attempt.error_code ? (
          <p className="mt-4 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
            Error: {attempt.error_code}
          </p>
        ) : null}

        <VideoReviewActions
          attemptId={attempt.id}
          jobId={attempt.video_job_id}
          status={attempt.status}
          revoked={Boolean(attempt.approval_revoked_at)}
        />
      </section>
    </div>
  );
}
