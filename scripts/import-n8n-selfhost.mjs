#!/usr/bin/env node
// Imports n8n/workflows/*.json into a self-hosted n8n (Railway/EC2) via the public API.
// - $vars.X  -> $env.X  (community edition has no Variables; needs N8N_BLOCK_ENV_ACCESS_IN_NODE=false)
// - creates/reuses "Telegram account" + "OpenAI account" credentials
// - remaps workflow-ID references (sub-workflow calls, errorWorkflow) to the new IDs
// - activates everything that has a trigger
// Reads secrets from .env.n8n.local (gitignored). Never prints them.
//
// .env.n8n.local:
//   N8N_URL=https://your-n8n.up.railway.app
//   N8N_API_KEY=...
//   OPENAI_API_KEY=...
//   TELEGRAM_BOT_TOKEN=...
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const envFile = join(root, ".env.n8n.local");
if (!existsSync(envFile)) {
  console.error("Missing .env.n8n.local (N8N_URL, N8N_API_KEY, OPENAI_API_KEY, TELEGRAM_BOT_TOKEN)");
  process.exit(1);
}
const env = Object.fromEntries(
  readFileSync(envFile, "utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    }),
);
// n8n Cloud keeps $vars (Variables exist there); self-hosted community edition needs $env.
const CLOUD = /\.app\.n8n\.cloud/.test(env.N8N_URL || "");
for (const k of ["N8N_URL", "N8N_API_KEY", "TELEGRAM_BOT_TOKEN", ...(CLOUD ? [] : ["OPENAI_API_KEY"])]) {
  if (!env[k]) {
    console.error(`.env.n8n.local is missing ${k}`);
    process.exit(1);
  }
}
const BASE = env.N8N_URL.replace(/\/+$/, "").replace(/^(?!https?:\/\/)/, "https://");

async function api(method, path, body) {
  const res = await fetch(`${BASE}/api/v1${path}`, {
    method,
    headers: { "X-N8N-API-KEY": env.N8N_API_KEY, "Content-Type": "application/json", Accept: "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text.slice(0, 300) };
  }
  if (!res.ok) {
    const err = new Error(`${method} ${path} -> ${res.status}: ${json.message || json.raw || text.slice(0, 300)}`);
    err.status = res.status;
    throw err;
  }
  return json;
}

async function listAll(path) {
  const out = [];
  let cursor;
  do {
    const r = await api("GET", `${path}${path.includes("?") ? "&" : "?"}limit=100${cursor ? `&cursor=${cursor}` : ""}`);
    out.push(...(r.data || []));
    cursor = r.nextCursor;
  } while (cursor);
  return out;
}

// ---- credentials -------------------------------------------------------------
async function ensureCredential(name, type, candidates) {
  try {
    const existing = (await listAll("/credentials")).find((c) => c.name === name && c.type === type);
    if (existing) {
      console.log(`✓ credential "${name}" exists (${existing.id})`);
      return existing.id;
    }
  } catch {
    /* older n8n: no list endpoint, just create */
  }
  let lastErr;
  for (const data of candidates) {
    try {
      const c = await api("POST", "/credentials", { name, type, data });
      console.log(`✓ credential "${name}" created (${c.id})`);
      return c.id;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

const telegramCred = await ensureCredential("Telegram account", "telegramApi", [
  { accessToken: env.TELEGRAM_BOT_TOKEN },
  { accessToken: env.TELEGRAM_BOT_TOKEN, baseUrl: "https://api.telegram.org" },
]);
let openAiCred = null;
if (env.OPENAI_API_KEY) {
  openAiCred = await ensureCredential("OpenAI account", "openAiApi", [
    { apiKey: env.OPENAI_API_KEY },
    { apiKey: env.OPENAI_API_KEY, header: false },
    { apiKey: env.OPENAI_API_KEY, organizationId: "", url: "https://api.openai.com/v1", header: false },
  ]);
} else {
  // n8n Cloud: reuse any OpenAI credential already in the account (e.g. the free-credits one).
  const found = (await listAll("/credentials").catch(() => [])).find((c) => c.type === "openAiApi");
  openAiCred = found?.id ?? null;
  console.log(found ? `✓ using OpenAI credential "${found.name}"` : "! no OpenAI credential found — set one on the OpenAI nodes in WF-01 and WF-A1");
}
const credIds = { telegramApi: telegramCred, openAiApi: openAiCred };

// ---- workflows ---------------------------------------------------------------
// Dependency order: error handler + sub-workflows before their callers.
const ORDER = [
  "WF-04-error-handling.json",
  "SUB-telegram-send.json",
  "WF-01-generate-project.json",
  "WF-02-render-video.json",
  "WF-00-queue-scheduler.json",
  "WF-03-publishing-analytics.json",
  "WF-06-notifications.json",
  "WF-A1-project-agent-chat.json",
  "WF-A2-telegram-gateway.json",
];
// n8n 2.x only runs an error workflow that is published, so WF-04 is activated too.
const NO_ACTIVATE = new Set();

const existing = await listAll("/workflows");
const idMap = {}; // old cloud id -> new id
const created = [];

for (const file of ORDER) {
  const raw = readFileSync(join(root, "n8n/workflows", file), "utf8");
  const src = JSON.parse(raw);
  let text = JSON.stringify({ nodes: src.nodes, connections: src.connections, settings: src.settings || {} });
  if (!CLOUD) text = text.replaceAll("$vars.", "$env.");
  for (const [oldId, newId] of Object.entries(idMap)) text = text.replaceAll(oldId, newId);
  const body = JSON.parse(text);

  for (const node of body.nodes) {
    for (const credType of Object.keys(node.credentials || {})) {
      if (!credIds[credType]) delete node.credentials[credType];
      else node.credentials[credType] = { id: credIds[credType], name: node.credentials[credType].name };
    }
    // n8n Cloud's free OpenAI credits need no credential; self-hosted does.
    if (node.credentials && !Object.keys(node.credentials).length) delete node.credentials;
    if (openAiCred && node.type === "@n8n/n8n-nodes-langchain.lmChatOpenAi" && !node.credentials?.openAiApi) {
      node.credentials = { ...(node.credentials || {}), openAiApi: { id: openAiCred, name: "OpenAI account" } };
    }
  }
  const settings = {};
  for (const k of ["executionOrder", "errorWorkflow", "callerPolicy"]) if (body.settings[k]) settings[k] = body.settings[k];
  const payload = { name: src.name, nodes: body.nodes, connections: body.connections, settings };

  const prior = existing.find((w) => w.name === src.name);
  let wf;
  if (prior) {
    if (prior.active) await api("POST", `/workflows/${prior.id}/deactivate`).catch(() => {});
    wf = await api("PUT", `/workflows/${prior.id}`, payload);
    console.log(`↻ updated  ${src.name} (${wf.id})`);
  } else {
    wf = await api("POST", "/workflows", payload);
    console.log(`+ created  ${src.name} (${wf.id})`);
  }
  idMap[src.id] = wf.id;
  created.push({ name: src.name, id: wf.id });
}

// ---- activate ----------------------------------------------------------------
let failures = 0;
for (const { name, id } of created) {
  if (NO_ACTIVATE.has(name)) continue;
  try {
    await api("POST", `/workflows/${id}/activate`);
    console.log(`▶ active   ${name}`);
  } catch (e) {
    if (name.startsWith("SUB ") && /trigger/i.test(e.message)) {
      console.log(`· ${name}: sub-workflow, no activation needed`);
      continue;
    }
    failures++;
    console.log(`✗ ${name}: ${e.message}`);
  }
}

console.log(`\nSet in Vercel:  N8N_WEBHOOK_BASE_URL=${BASE}/webhook`);
console.log(failures ? `\n${failures} workflow(s) failed to activate — see above.` : "\nAll done.");
