"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Player } from "@remotion/player";
import { Button } from "@/components/ui/button";
import {
  checkBrowserRenderCompat,
  exportShortFormMp4,
} from "@/lib/remotion/export-media";
import {
  BROWSER_COMPOSITION,
  ShortFormVideo,
  durationInFramesForScenes,
  type ShortFormScene,
} from "@/remotion/short-form-video";

type Phase =
  | "idle"
  | "checking"
  | "preparing"
  | "rendering"
  | "uploading"
  | "done"
  | "failed"
  | "cancelled";

/** Module lock — only one browser encode per tab. */
let browserRenderBusy = false;

interface BrowserRemotionExportProps {
  conceptId: string;
  conceptVersionId: string;
  canProduce: boolean;
  title: string;
  scenes: ShortFormScene[];
  existingJobId?: string | null;
}

/**
 * User-initiated Remotion export: prepare → WebCodecs MP4 → upload → review.
 * Does not claim unattended automation success.
 */
export function BrowserRemotionExport({
  conceptId,
  conceptVersionId,
  canProduce,
  title,
  scenes,
  existingJobId = null,
}: BrowserRemotionExportProps) {
  const router = useRouter();
  const abortRef = useRef<AbortController | null>(null);
  const jobIdRef = useRef<string | null>(existingJobId);
  const unloadArmedRef = useRef(false);

  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [compatNote, setCompatNote] = useState<string | null>(null);
  const [reviewPath, setReviewPath] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(existingJobId);

  const previewScenes =
    scenes.length > 0
      ? scenes.slice(0, BROWSER_COMPOSITION.maxScenes)
      : [{ caption: title || "AI Content Studio" }];
  const durationInFrames = durationInFramesForScenes(previewScenes.length);

  useEffect(() => {
    return () => {
      // Tab/component unmount during an active render → interrupt accurately.
      if (unloadArmedRef.current && jobIdRef.current) {
        const id = jobIdRef.current;
        void fetch(`/api/video-jobs/${id}/browser-render/interrupt`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason: "tab_closed" }),
          keepalive: true,
        });
      }
      abortRef.current?.abort();
      browserRenderBusy = false;
    };
  }, []);

  async function queueJobIfNeeded(): Promise<string> {
    if (jobIdRef.current) return jobIdRef.current;

    const res = await fetch(`/api/concept-versions/${conceptVersionId}/render`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productionMode: "remotion",
        estimatedCost: 0,
        idempotencyKey: `browser-remotion:${conceptVersionId}:${Date.now()}`,
      }),
    });
    const json = (await res.json()) as {
      status: string;
      data?: { job?: { id: string }; reused?: boolean };
      error?: { message?: string };
    };
    if (!res.ok || json.status === "error" || !json.data?.job?.id) {
      throw new Error(json.error?.message ?? "Unable to queue remotion job");
    }
    jobIdRef.current = json.data.job.id;
    setJobId(json.data.job.id);
    return json.data.job.id;
  }

  async function startExport() {
    if (!canProduce) {
      setError("Approve the concept and authorize produce_paid_media first.");
      return;
    }
    if (browserRenderBusy || phase === "rendering" || phase === "uploading") {
      setError("A browser render is already in progress in this tab.");
      return;
    }

    setError(null);
    setReviewPath(null);
    setProgress(0);
    setPhase("checking");
    browserRenderBusy = true;

    try {
      const compat = await checkBrowserRenderCompat();
      if (!compat.canRender) {
        const msg =
          compat.issues.map((i) => i.message).join("; ") ||
          "This browser cannot encode MP4 via WebCodecs.";
        setCompatNote(msg);
        setPhase("failed");
        setError(msg);
        browserRenderBusy = false;
        return;
      }
      setCompatNote(
        compat.resolvedVideoCodec
          ? `Codec ready: ${compat.resolvedVideoCodec}`
          : "Browser codec check passed",
      );

      setPhase("preparing");
      const queuedJobId = await queueJobIfNeeded();

      const prepareRes = await fetch(
        `/api/video-jobs/${queuedJobId}/browser-render/prepare`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title, scenes: previewScenes }),
        },
      );
      const prepareJson = (await prepareRes.json()) as {
        status: string;
        data?: {
          composition?: { title: string; scenes: ShortFormScene[] };
        };
        error?: { message?: string };
      };
      if (!prepareRes.ok || prepareJson.status === "error") {
        throw new Error(
          prepareJson.error?.message ?? "Failed to prepare browser render",
        );
      }

      const compositionTitle =
        prepareJson.data?.composition?.title ?? title;
      const compositionScenes =
        prepareJson.data?.composition?.scenes ?? previewScenes;

      const controller = new AbortController();
      abortRef.current = controller;
      unloadArmedRef.current = true;
      setPhase("rendering");

      const { blob, durationMs } = await exportShortFormMp4({
        title: compositionTitle,
        scenes: compositionScenes,
        signal: controller.signal,
        onProgress: (p) => setProgress(p),
      });

      setPhase("uploading");
      const form = new FormData();
      form.append("file", blob, `render-${queuedJobId}.mp4`);
      form.append("durationMs", String(durationMs));

      const completeRes = await fetch(
        `/api/video-jobs/${queuedJobId}/browser-render/complete`,
        { method: "POST", body: form },
      );
      const completeJson = (await completeRes.json()) as {
        status: string;
        data?: { reviewPath?: string; attemptId?: string };
        error?: { message?: string };
      };

      if (!completeRes.ok || completeJson.status === "error") {
        throw new Error(
          completeJson.error?.message ?? "Failed to upload rendered MP4",
        );
      }

      unloadArmedRef.current = false;
      setPhase("done");
      setProgress(1);
      const path =
        completeJson.data?.reviewPath ??
        (completeJson.data?.attemptId
          ? `/videos/${completeJson.data.attemptId}`
          : null);
      setReviewPath(path);
      router.refresh();
    } catch (err) {
      const aborted = abortRef.current?.signal.aborted;
      if (aborted) {
        setPhase("cancelled");
        setError("Render cancelled.");
        if (jobIdRef.current) {
          void fetch(
            `/api/video-jobs/${jobIdRef.current}/browser-render/interrupt`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ reason: "user_cancelled" }),
            },
          );
        }
      } else {
        setPhase("failed");
        setError(err instanceof Error ? err.message : "Browser render failed");
        if (jobIdRef.current) {
          void fetch(
            `/api/video-jobs/${jobIdRef.current}/browser-render/interrupt`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                reason: "render_error",
                message: err instanceof Error ? err.message : "render failed",
              }),
            },
          );
        }
      }
      unloadArmedRef.current = false;
    } finally {
      browserRenderBusy = false;
      abortRef.current = null;
    }
  }

  function cancel() {
    abortRef.current?.abort();
  }

  const busy =
    phase === "checking" ||
    phase === "preparing" ||
    phase === "rendering" ||
    phase === "uploading";

  return (
    <div className="space-y-4 rounded-xl border border-border bg-surface-strong p-4">
      <div>
        <h2 className="font-display text-xl tracking-tight">
          Browser video export
        </h2>
        <p className="mt-1 text-sm text-muted">
          User-initiated Remotion encode in this browser (720p, ~5–10s). Not
          unattended automation — closing the tab interrupts the job.
        </p>
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-black">
        <Player
          component={ShortFormVideo}
          inputProps={{ title, scenes: previewScenes }}
          durationInFrames={durationInFrames}
          fps={BROWSER_COMPOSITION.fps}
          compositionWidth={BROWSER_COMPOSITION.width}
          compositionHeight={BROWSER_COMPOSITION.height}
          style={{ width: "100%" }}
          controls
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="primary"
          disabled={!canProduce || busy}
          onClick={() => void startExport()}
        >
          {busy
            ? phase === "uploading"
              ? "Uploading…"
              : phase === "rendering"
                ? `Rendering ${Math.round(progress * 100)}%`
                : "Preparing…"
            : "Export MP4 in browser"}
        </Button>
        {phase === "rendering" ? (
          <Button variant="secondary" onClick={cancel}>
            Cancel
          </Button>
        ) : null}
        {reviewPath ? (
          <Button
            variant="secondary"
            onClick={() => router.push(reviewPath)}
          >
            Open for review
          </Button>
        ) : null}
      </div>

      {(phase === "rendering" || phase === "uploading") && (
        <div
          className="h-2 overflow-hidden rounded-full bg-border"
          role="progressbar"
          aria-valuenow={Math.round(progress * 100)}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className="h-full bg-accent transition-[width] duration-200"
            style={{
              width: `${Math.min(100, Math.round(progress * 100))}%`,
            }}
          />
        </div>
      )}

      {compatNote ? (
        <p className="text-xs text-muted">{compatNote}</p>
      ) : null}
      {jobId ? (
        <p className="text-xs text-muted">Job · {jobId}</p>
      ) : null}
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {phase === "done" ? (
        <p className="text-sm text-accent">
          MP4 generated, uploaded, and verified. Ready for review
          {conceptId ? ` on concept ${conceptId.slice(0, 8)}` : ""}.
        </p>
      ) : null}
      {!canProduce ? (
        <p className="text-sm text-muted">
          Requires an approved concept version and an active produce_paid_media
          grant for this project.
        </p>
      ) : null}
    </div>
  );
}
