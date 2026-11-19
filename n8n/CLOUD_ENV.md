# n8n Cloud variables (Code by Hani)

Set these in n8n: **Settings → Variables**. In expressions use `{{ $vars.NAME }}` — **not** `$env` (Cloud returns “access to env vars denied”).

| Variable | Value |
|---|---|
| `ACS_API_BASE_URL` | `https://ai-content-studio-one-sigma.vercel.app` |
| `ACS_INTERNAL_SERVICE_TOKEN` | same value as Vercel / `apps/web/.env.local` (do not invent a new one) |

App (Vercel) side:

| Variable | Value |
|---|---|
| `N8N_BASE_URL` | `https://codebyhani.app.n8n.cloud` |
| `N8N_WEBHOOK_BASE_URL` | `https://codebyhani.app.n8n.cloud/webhook` |
| `NEXT_PUBLIC_APP_URL` | `https://ai-content-studio-one-sigma.vercel.app` |
| `ACS_INTERNAL_SERVICE_TOKEN` | same as n8n |

WF-A1 production webhook (after publish):

`https://codebyhani.app.n8n.cloud/webhook/agent-web`

Order: set n8n variables → publish WF-A1 → set app `N8N_WEBHOOK_BASE_URL` on Vercel → redeploy app.
