#!/usr/bin/env node
// Exports the v2.7 workflows from n8n Cloud into n8n/workflows/*.json (credentials stripped to name refs).
import { writeFile } from "node:fs/promises";
import { join } from "node:path";

const base = process.env.N8N_BASE_URL?.replace(/\/$/, "");
const key = process.env.N8N_API_KEY;
if (!base || !key) {
  console.error("Set N8N_BASE_URL and N8N_API_KEY");
  process.exit(1);
}

const IDS = {
  "WF-00-queue-scheduler": "c3VwV5JlwWHW02Gr",
  "WF-01-generate-project": "HAcp9KphY2c6quix",
  "WF-02-render-video": "pFPyYRiZKu9dr2LO",
  "WF-03-publishing-analytics": "nesO8x03td8rF25k",
  "WF-04-error-handling": "Skab0JCwPCgIgrYN",
  "WF-06-notifications": "ZMoSD2okLc7psv3z",
  "WF-A1-project-agent-chat": "1FOlfsXAnFVbqDzw",
  "WF-A2-telegram-gateway": "EAETpN89kJ1GVTC4",
};

for (const [file, id] of Object.entries(IDS)) {
  const res = await fetch(`${base}/api/v1/workflows/${id}`, { headers: { "X-N8N-API-KEY": key } });
  if (!res.ok) {
    console.error(`${file}: ${res.status}`);
    continue;
  }
  const wf = await res.json();
  for (const n of wf.nodes ?? []) {
    for (const c of Object.values(n.credentials ?? {})) c.id = "REPLACE_ME";
  }
  const out = { name: wf.name, nodes: wf.nodes, connections: wf.connections, settings: wf.settings };
  await writeFile(join("n8n/workflows", `${file}.json`), `${JSON.stringify(out, null, 2)}\n`);
  console.log(`exported ${file}`);
}
