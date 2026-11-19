import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

const PORT = Number(process.env.PORT ?? 8787);

interface RenderBody {
  jobId?: string;
}

/**
 * Minimal Remotion render-worker stub.
 * Accepts POST /render with { jobId } and acknowledges fixture mode.
 */
const server = createServer((req, res) => {
  void handleRequest(req, res);
});

async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

  if (req.method === "GET" && url.pathname === "/health") {
    sendJson(res, 200, { status: "ok", fixture: true });
    return;
  }

  if (req.method === "POST" && url.pathname === "/render") {
    try {
      const body = (await readJson(req)) as RenderBody;
      if (!body.jobId || typeof body.jobId !== "string") {
        sendJson(res, 400, {
          status: "error",
          error: { message: "jobId is required" },
        });
        return;
      }

      console.info("[render-worker] accepted fixture render", {
        jobId: body.jobId,
      });

      sendJson(res, 202, { status: "accepted", fixture: true, jobId: body.jobId });
    } catch (error) {
      console.error("[render-worker] failed to parse body", error);
      sendJson(res, 400, {
        status: "error",
        error: { message: "Invalid JSON body" },
      });
    }
    return;
  }

  sendJson(res, 404, { status: "error", error: { message: "Not found" } });
}

function readJson(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
    });
    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8");
        resolve(raw ? JSON.parse(raw) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function sendJson(
  res: ServerResponse,
  statusCode: number,
  payload: Record<string, unknown>,
): void {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

server.listen(PORT, () => {
  console.info(`[render-worker] listening on http://localhost:${PORT}`);
});
