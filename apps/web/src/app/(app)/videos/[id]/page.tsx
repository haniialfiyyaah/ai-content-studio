import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Button } from "@/components/ui/button";
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
      "id, status, provider, model_id, output_asset_id, approved_at, approval_revoked_at, error_code, video_job_id, created_at",
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
          "id, status, provider, model_id, output_asset_id, approved_at, approval_revoked_at, error_code, video_job_id, created_at",
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
      <div className="app-page">
        <section className="studio-panel" style={{ padding: "1.75rem 2rem" }}>
          <p className="auth-brand">Video review</p>
          <h1 className="app-hero-title" style={{ fontSize: "1.75rem" }}>
            Video not available
          </h1>
          <p className="app-hero-copy">
            This attempt is missing, still rendering, or belongs to another
            account. Open your library or produce a new render from an approved
            concept.
          </p>
          <div style={{ display: "flex", gap: "0.75rem", marginTop: "1.25rem" }}>
            <Link href="/videos" className="studio-button">
              Videos library
            </Link>
            <Link href="/" className="studio-button" style={{ opacity: 0.85 }}>
              Overview
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

  return (
    <div className="app-page">
      <section className="studio-panel" style={{ padding: "1.75rem 2rem" }}>
        <p className="auth-brand">Video review</p>
        <h1 className="app-hero-title" style={{ fontSize: "1.75rem" }}>
          Attempt {attempt.id.slice(0, 8)}
        </h1>
        <p className="app-hero-copy">
          Status <strong>{attempt.status}</strong>
          {attempt.provider ? ` · ${attempt.provider}` : ""}
          {attempt.model_id ? ` · ${attempt.model_id}` : ""}
        </p>

        {signedUrl ? (
          <video
            controls
            src={signedUrl}
            style={{
              width: "100%",
              maxWidth: 360,
              marginTop: "1.5rem",
              borderRadius: 16,
              background: "#171410",
            }}
          />
        ) : (
          <p className="app-hero-copy" style={{ marginTop: "1.5rem" }}>
            {attempt.output_asset_id
              ? "Output asset exists but a signed URL could not be created."
              : "No rendered output yet. Open Content → Production and export an MP4 in the browser (or complete a cloud render when available)."}
          </p>
        )}

        {assetMeta ? (
          <p className="app-hero-copy" style={{ marginTop: "0.75rem", fontSize: "0.875rem" }}>
            {assetMeta.storage_path}
            {assetMeta.size_bytes != null
              ? ` · ${(assetMeta.size_bytes / 1024).toFixed(1)} KB`
              : ""}
          </p>
        ) : null}

        {attempt.error_code ? (
          <p className="auth-alert" style={{ marginTop: "1rem" }}>
            Error: {attempt.error_code}
          </p>
        ) : null}

        <VideoReviewActions
          attemptId={attempt.id}
          jobId={attempt.video_job_id}
          status={attempt.status}
          revoked={Boolean(attempt.approval_revoked_at)}
        />
        <div className="app-actions" style={{ marginTop: "1.5rem" }}>
          <Link href="/videos">
            <Button variant="secondary" className="studio-button-secondary">
              Back to videos
            </Button>
          </Link>
        </div>
      </section>
    </div>
  );
}
