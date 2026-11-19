#!/usr/bin/env node
/**
 * Imports n8n workflow JSON from n8n/workflows into a running n8n instance.
 * Uses N8N_BASE_URL + N8N_API_KEY (or basic auth via N8N_USER/N8N_PASSWORD).
 * Never logs secrets. Skips files that look like credentials dumps.
 */
import { readdir, readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const workflowsDir = join(root, "n8n/workflows");
const baseUrl = (process.env.N8N_BASE_URL || "http://localhost:5678").replace(
  /\/$/,
  "",
);
const apiKey = process.env.N8N_API_KEY || "";

function authHeaders() {
  const headers = { "Content-Type": "application/json" };
  if (apiKey) {
    headers["X-N8N-API-KEY"] = apiKey;
    return headers;
  }
  const user = process.env.N8N_USER || "admin";
  const password = process.env.N8N_PASSWORD || "";
  if (password) {
    headers.Authorization =
      "Basic " + Buffer.from(`${user}:${password}`).toString("base64");
  }
  return headers;
}

function looksLikeSecretLeak(raw) {
  return /sk-[a-zA-Z0-9]{20,}|BEGIN (RSA |OPENSSH )?PRIVATE KEY|api[_-]?key["']?\s*:\s*["'][^"']{16,}/i.test(
    raw,
  );
}

async function main() {
  const files = (await readdir(workflowsDir))
    .filter((f) => f.endsWith(".json"))
    .sort();

  if (!apiKey && !process.env.N8N_PASSWORD) {
    console.error(
      "Set N8N_API_KEY (preferred) or N8N_PASSWORD before importing.",
    );
    process.exit(1);
  }

  let ok = 0;
  let failed = 0;

  for (const file of files) {
    const path = join(workflowsDir, file);
    const raw = await readFile(path, "utf8");
    if (looksLikeSecretLeak(raw)) {
      console.error(`SKIP ${file}: possible secret material`);
      failed += 1;
      continue;
    }

    let workflow;
    try {
      workflow = JSON.parse(raw);
    } catch {
      console.error(`SKIP ${file}: invalid JSON`);
      failed += 1;
      continue;
    }

    const payload = {
      name: workflow.name || file.replace(/\.json$/, ""),
      nodes: workflow.nodes || [],
      connections: workflow.connections || {},
      settings: workflow.settings || { executionOrder: "v1" },
      staticData: workflow.staticData ?? null,
      // n8n SQLite requires active boolean on create.
      active: false,
    };

    const res = await fetch(`${baseUrl}/api/v1/workflows`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error(`FAIL ${file}: HTTP ${res.status} ${text.slice(0, 200)}`);
      failed += 1;
      continue;
    }

    const created = await res.json();
    console.log(`OK   ${file} → id=${created.id || created.data?.id || "?"}`);
    ok += 1;
  }

  console.log(`\nImported ${ok}, failed ${failed}`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
