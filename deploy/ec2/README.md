# EC2 stack: n8n + renderer

One small server runs the automation side of AI Content Studio:

| Service | What it does |
|---|---|
| `n8n` (+ `task-runners`) | All workflows (generation, render queue, Telegram, publishing, notifications) |
| `postgres` | n8n's database (workflows, credentials, executions) |
| `renderer` | Remotion renderer built from `apps/renderer` (`POST /render`) |
| `caddy` | HTTPS (Let's Encrypt) in front of both |

URLs (with `DOMAIN_NAME=acs-n8n.duckdns.org`):

- n8n editor + webhooks: `https://acs-n8n.duckdns.org` (`/webhook/...`)
- renderer: `https://acs-n8n.duckdns.org/renderer` (`/renderer/health`, `/renderer/render`)

Current server: `t3.small` (2 GB RAM + 2 GB swap), Ubuntu 24.04, Sydney, Elastic IP.
A 720p render takes ~70 s. Resize to `t3.medium` if renders get OOM-killed.

## Rebuild from scratch

1. **Server**: Ubuntu 24.04, ≥2 GB RAM, ≥20 GB disk. Security group: allow 22, 80, 443.
   Attach an **Elastic IP** and point the domain's A record at it.
2. **Docker**:
   ```bash
   curl -fsSL https://get.docker.com | sudo sh && sudo usermod -aG docker $USER  # then re-login
   ```
3. **Swap** (2 GB):
   ```bash
   sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
   echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
   ```
4. **Files** (from your machine, repo root):
   ```bash
   scp -i key.pem deploy/ec2/{compose.yaml,Caddyfile,.env.example} ubuntu@IP:~/acs-n8n/
   rsync -az --exclude node_modules --exclude build -e "ssh -i key.pem" apps/renderer/ ubuntu@IP:~/acs-n8n/renderer/
   ```
5. **Secrets**: on the server `cd ~/acs-n8n && cp .env.example .env && nano .env` and fill every value
   (`openssl rand -hex 32` for keys). Back up `N8N_ENCRYPTION_KEY` — without it saved credentials can't be read.
6. **Start**:
   ```bash
   docker compose build renderer && docker compose up -d
   curl https://$DOMAIN/healthz && curl https://$DOMAIN/renderer/health
   ```
7. **n8n**: open the editor, create the owner account, then **Settings → n8n API → Create API key**.
8. **Workflows** (from your machine): fill `.env.n8n.local` (`N8N_URL`, `N8N_API_KEY`, `OPENAI_API_KEY`,
   `TELEGRAM_BOT_TOKEN`) and run `node scripts/import-n8n-selfhost.mjs`. It imports `n8n/workflows/*.json`,
   switches `$vars` → `$env`, creates the Telegram + OpenAI credentials, remaps workflow IDs and activates everything.
9. **Vercel** env, then redeploy:
   ```
   N8N_WEBHOOK_BASE_URL=https://$DOMAIN/webhook
   RENDERER_URL=https://$DOMAIN/renderer
   RENDERER_TOKEN=<same as on the server>
   ```

## Day-to-day

```bash
ssh -i key.pem ubuntu@IP
cd ~/acs-n8n
docker compose ps                      # status
docker compose logs -f n8n             # or renderer / caddy
docker compose pull && docker compose up -d   # update images (bump N8N_VERSION in .env first)
```

Update the renderer after changing `apps/renderer`: rsync it again (step 4), then
`docker compose build renderer && docker compose up -d renderer`.

## Gotchas

- `WEBHOOK_URL` (not `N8N_WEBHOOK_URL`) must be the public HTTPS URL, or Telegram triggers register a wrong address.
- Community n8n has no Variables: workflows read `$env.*`, which needs `N8N_BLOCK_ENV_ACCESS_IN_NODE=false`.
- n8n only runs the error workflow (WF-04) when it is **published/active**.
- Deactivating a Telegram-trigger workflow anywhere deletes the bot's webhook; re-activate WF-A2 on this server after.
- Never commit `.env` or the `.pem` key (both gitignored).
