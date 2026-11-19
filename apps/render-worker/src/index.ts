import { createServer } from "node:http";
import { renderShortForm } from "./render.js";

const port = Number(process.env.PORT ?? 3100);
const token = process.env.RENDER_WORKER_TOKEN ?? "local-render-worker-token";

/**
 * Remotion render worker HTTP surface.
 * Default path is explicit fixture; live Remotion requires ACS_REMOTION_LIVE=true
 * plus remotion/@remotion/renderer installed (not present on disk-constrained hosts).
 */
const server = createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    const live = process.env.ACS_REMOTION_LIVE === "true";
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        ok: true,
        remotionLiveFlag: live,
        fixtureCapable: true,
      }),
    );
    return;
  }

  if (req.method === "POST" && req.url === "/render") {
    const auth = req.headers["x-render-token"];
    if (auth !== token) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "UNAUTHORIZED" }));
      return;
    }

    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    let body: {
      jobId?: string;
      attemptId?: string;
      title?: string;
      scenes?: Array<{ narration?: string; caption?: string }>;
    } = {};
    try {
      body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
    } catch {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "VALIDATION_ERROR" }));
      return;
    }

    const result = await renderShortForm(body);
    const statusCode =
      result.status === "failed" ? 501 : result.status === "accepted" ? 202 : 200;
    res.writeHead(statusCode, { "Content-Type": "application/json" });
    res.end(JSON.stringify(result));
    return;
  }

  res.writeHead(404).end();
});

server.listen(port, () => {
  console.info(`[render-worker] listening on :${port}`);
});
