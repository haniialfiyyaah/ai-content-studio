# n8n workflows (v2.7)

Live on `codebyhani.app.n8n.cloud`; see `docs/ARCHITECTURE.md` for ids and triggers.
Snapshot JSON into this folder with:

```bash
N8N_BASE_URL=https://codebyhani.app.n8n.cloud N8N_API_KEY=… node scripts/export-n8n-workflows.mjs
```

Conventions: numbered node names (`01-02 …`), `$vars.ACS_API_BASE_URL` +
`$vars.ACS_INTERNAL_SERVICE_TOKEN` for every Studio call, no DB access from n8n,
WF-04 as the error workflow everywhere, webhooks respond on receipt.
