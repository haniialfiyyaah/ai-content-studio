#!/usr/bin/env node
/**
 * Cloud-backed M4 smoke (legacy worker path): auth → Agent (fixture) →
 * approve → grant → claim → Remotion worker → report attempt URL.
 * Does not print secrets. Requires Next :3000.
 * For MVP browser export, use Content → Production in the UI instead
 * (ACS_REMOTION_RENDER_BACKEND=browser; render-worker not required).
 * Legacy: set ACS_REMOTION_RENDER_BACKEND=legacy_worker + worker :3100.
 *
 * Prefer ACS_SMOKE_EMAIL / ACS_SMOKE_PASSWORD (existing account).
 * Otherwise creates a confirmed user via Auth Admin (avoids signup rate limits).
 */
import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const BASE = process.env.ACS_SMOKE_BASE ?? "http://127.0.0.1:3000";
const ROOT = new URL("..", import.meta.url).pathname;
const requireFromWeb = createRequire(
  join(ROOT, "apps/web/package.json"),
);
const { createClient } = requireFromWeb("@supabase/supabase-js");
const cookieJar = join(tmpdir(), `acs-smoke-${Date.now()}.cookies`);

function loadEnvLocal() {
  const raw = readFileSync(join(ROOT, "apps/web/.env.local"), "utf8");
  const env = {};
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#") || !t.includes("=")) continue;
    const i = t.indexOf("=");
    env[t.slice(0, i)] = t.slice(i + 1);
  }
  return env;
}

async function ensureSmokeUser(env, email, password) {
  if (process.env.ACS_SMOKE_EMAIL) {
    return { email, password, created: false };
  }
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Missing Supabase URL/service role for admin user create");
  }
  const admin = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: "M4 Smoke" },
  });
  if (error) {
    throw new Error(`admin createUser failed: ${error.message}`);
  }
  return { email, password, created: true, userId: data.user?.id };
}

function curlJson(method, path, { body, headers = {}, serviceToken } = {}) {
  const args = [
    "-sS",
    "-c",
    cookieJar,
    "-b",
    cookieJar,
    "-X",
    method,
    `${BASE}${path}`,
    "-H",
    "Content-Type: application/json",
    "-w",
    "\n__HTTP__%{http_code}",
  ];
  for (const [k, v] of Object.entries(headers)) {
    args.push("-H", `${k}: ${v}`);
  }
  if (serviceToken) {
    args.push("-H", `x-acs-service-token: ${serviceToken}`);
  }
  if (body !== undefined) {
    args.push("-d", JSON.stringify(body));
  }
  const res = spawnSync("curl", args, { encoding: "utf8", maxBuffer: 10e6 });
  if (res.status !== 0) {
    throw new Error(`curl failed: ${res.stderr || res.stdout}`);
  }
  const out = res.stdout;
  const idx = out.lastIndexOf("\n__HTTP__");
  const raw = idx >= 0 ? out.slice(0, idx) : out;
  const status = Number(idx >= 0 ? out.slice(idx + 9) : 0);
  let json = null;
  try {
    json = raw ? JSON.parse(raw) : null;
  } catch {
    json = { raw: raw.slice(0, 500) };
  }
  return { status, json };
}

function dataOf(json) {
  return json?.data ?? json;
}

function step(name, fn) {
  process.stdout.write(`→ ${name}... `);
  const result = fn();
  console.log("ok");
  return result;
}

const env = loadEnvLocal();
const token = env.ACS_INTERNAL_SERVICE_TOKEN;
if (!token) {
  console.error("Missing ACS_INTERNAL_SERVICE_TOKEN in .env.local");
  process.exit(1);
}

async function main() {
  const stamp = Date.now();
  const email =
    process.env.ACS_SMOKE_EMAIL ?? `acs.smoke.m4.${stamp}@mailinator.com`;
  const password = process.env.ACS_SMOKE_PASSWORD ?? "SmokeTestPass!234";

  writeFileSync(cookieJar, "");

  const ensured = await ensureSmokeUser(env, email, password);
  step(
    ensured.created ? "admin createUser (confirmed)" : "reuse ACS_SMOKE_EMAIL",
    () => ensured,
  );

  const login = step("login", () =>
    curlJson("POST", "/api/auth/login", {
      body: { email, password },
    }),
  );
  if (login.status >= 400) {
    throw new Error(`login ${login.status}: ${JSON.stringify(login.json)}`);
  }

  const agent = step("agent planning (fixture)", () =>
    curlJson("POST", "/api/agent/messages", {
      body: {
        content:
          "Create a short educational video series about practical TypeScript tips for beginners.",
        sourceSurface: "web",
      },
    }),
  );
  if (agent.status >= 400) {
    throw new Error(`agent ${agent.status}: ${JSON.stringify(agent.json)}`);
  }
  const agentData = dataOf(agent.json);
  const projectId = agentData?.projectId;
  if (!projectId) {
    throw new Error(`no projectId from agent: ${JSON.stringify(agent.json)}`);
  }
  console.log(`  projectId=${projectId}`);

  const concepts = step("list concepts", () =>
    curlJson("GET", `/api/projects/${projectId}/concepts`),
  );
  if (concepts.status >= 400) {
    throw new Error(`concepts ${concepts.status}: ${JSON.stringify(concepts.json)}`);
  }
  const conceptList = dataOf(concepts.json)?.concepts ?? [];
  if (!conceptList.length) {
    throw new Error("no concepts seeded by agent");
  }
  const conceptId = conceptList[0].id;
  const workingVersionId =
    conceptList[0].workingVersionId ?? conceptList[0].working_version_id;
  console.log(`  conceptId=${conceptId}`);

  const detail = step("concept detail", () =>
    curlJson("GET", `/api/concepts/${conceptId}`),
  );
  const versionId =
    dataOf(detail.json)?.workingVersion?.id ?? workingVersionId;
  if (!versionId) {
    throw new Error(`no working version: ${JSON.stringify(detail.json)}`);
  }
  console.log(`  versionId=${versionId}`);

  const approve = step("approve concept version", () =>
    curlJson("POST", `/api/concept-versions/${versionId}/approve`),
  );
  if (approve.status >= 400) {
    throw new Error(`approve ${approve.status}: ${JSON.stringify(approve.json)}`);
  }

  const grant = step("produce_paid_media grant", () =>
    curlJson("POST", `/api/projects/${projectId}/grants`, {
      body: { scope: "produce_paid_media", limitAmount: 0, currency: "USD" },
    }),
  );
  if (grant.status >= 400) {
    throw new Error(`grant ${grant.status}: ${JSON.stringify(grant.json)}`);
  }

  const render = step("queue remotion job", () =>
    curlJson("POST", `/api/concept-versions/${versionId}/render`, {
      body: {
        productionMode: "remotion",
        idempotencyKey: `smoke-m4-${stamp}`,
      },
    }),
  );
  if (render.status >= 400) {
    throw new Error(`render ${render.status}: ${JSON.stringify(render.json)}`);
  }
  const renderData = dataOf(render.json);
  const jobId = renderData?.job?.id;
  const attemptId = renderData?.attempt?.id;
  if (!jobId || !attemptId) {
    throw new Error(`missing job/attempt: ${JSON.stringify(render.json)}`);
  }
  console.log(`  jobId=${jobId}`);
  console.log(`  attemptId=${attemptId}`);

  const claim = step("claim job", () =>
    curlJson("POST", "/api/internal/jobs/claim", {
      serviceToken: token,
      body: { jobId, kind: "video", claimedBy: "smoke-m4" },
    }),
  );
  if (claim.status >= 400) {
    throw new Error(`claim ${claim.status}: ${JSON.stringify(claim.json)}`);
  }

  console.log("→ remotion live encode + storage (may take a minute)...");
  const remotion = curlJson("POST", "/api/internal/render/remotion", {
    serviceToken: token,
    body: {
      jobId,
      attemptId,
      title: "M4 Smoke Short",
      scenes: [
        { narration: "TypeScript tip one.", caption: "Tip 1" },
        { narration: "TypeScript tip two.", caption: "Tip 2" },
      ],
    },
  });
  if (remotion.status >= 400) {
    throw new Error(
      `remotion ${remotion.status}: ${JSON.stringify(remotion.json)}`,
    );
  }
  const remotionData = dataOf(remotion.json);
  console.log(
    `  remotion fixture=${remotionData?.fixture} outputAssetId=${remotionData?.outputAssetId ?? "null"}`,
  );

  console.log("\nSmoke result:");
  console.log(`  review: ${BASE}/videos/${attemptId}`);
  console.log(`  email: ${email}`);
  if (!remotionData?.outputAssetId || remotionData?.fixture) {
    console.log("  WARNING: expected live remotion with outputAssetId");
    process.exitCode = 2;
  } else {
    console.log("  OK: live remotion persisted asset");
  }
}

main()
  .catch((err) => {
    console.error("\nFAILED:", err.message ?? err);
    process.exitCode = 1;
  })
  .finally(() => {
    try {
      unlinkSync(cookieJar);
    } catch {
      /* ignore */
    }
  });
