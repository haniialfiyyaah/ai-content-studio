/**
 * Offline Remotion encode smoke — writes a real MP4 under apps/render-worker/out.
 * Usage: pnpm --filter render-worker render:verify
 */
import { renderShortForm } from "../src/render.js";

async function main(): Promise<void> {
  process.env.ACS_REMOTION_LIVE = "true";

  console.info("[verify-render] starting live Remotion encode…");
  const result = await renderShortForm({
    jobId: `verify-${Date.now()}`,
    attemptId: null as unknown as string | undefined,
    title: "Remotion verify",
    scenes: [
      { caption: "Disk free — live encode path" },
      { caption: "Authorized output for review" },
    ],
  });

  console.info(JSON.stringify(result, null, 2));

  if (result.status !== "completed" || result.fixture || !result.outputPath) {
    process.exitCode = 1;
    console.error("[verify-render] FAILED — expected live completed MP4");
    return;
  }

  console.info(`[verify-render] OK ${result.outputPath} (${result.bytes} bytes)`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
