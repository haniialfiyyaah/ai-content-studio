# Separate n8n deployment on EC2 / VPS

This creates a fresh, independent instance. The existing n8n Cloud instance,
its workflows, credentials, Telegram webhook, and the Studio app configuration
stay as they are. No Cloud migration or app cutover is part of these steps.

Based on `../../Phase3/milestones/mart-ops/compose.yaml`, `compose.vps.yaml`, and
`Caddyfile` (paths relative to the project root). This folder is a standalone
Compose project; do not combine it with the root development Compose file.

Traffic: internet → Caddy (80/443, automatic HTTPS) → n8n (5678, Docker network
only). Task runners connect to n8n on internal port 5679. Only Caddy publishes
host ports. n8n and runners share one pinned version, initially the reference's
2.44.7; this is not a claim that it is the newest release.

This stack explicitly configures n8n to use a dedicated PostgreSQL database
for workflows, credentials, and execution history. PostgreSQL data lives in
`postgres_data`; keep `n8n_data` too, because n8n still uses its settings/data
directory. PostgreSQL has no published host port. The existing Studio
Supabase database is separate and unchanged.

The reference's Postgres service stores Mart business data; unlike this stack,
its n8n service has no `DB_TYPE=postgresdb` configuration and uses SQLite.
This deployment is a single instance, not high availability. Use this setup
before saving workflows: adding PostgreSQL to an existing SQLite deployment
does not migrate its data automatically.

## 1. Create the server

For AWS: EC2 → Launch instance. Use a new instance, for example `acs-n8n`:

- Ubuntu Server 24.04 LTS, x86_64.
- For light testing, start with 2 GiB RAM (for example `t3.small`); 4 GiB gives
  more room for Code nodes and concurrent workflows. Check your account's
  eligibility and the current regional price before launching.
- 20 GiB gp3 storage as a starting point; monitor free disk space.
- Create/download a key pair and keep the `.pem` file on your laptop.
- Use a public subnet with an internet route and a public IPv4 address.

Security Group inbound rules:

| Type | TCP port | Source |
| --- | --- | --- |
| SSH | 22 | My IP (`your-public-ip/32`) |
| HTTP | 80 | `0.0.0.0/0` |
| HTTPS | 443 | My IP initially; public access can be enabled after owner setup |

Keep outbound internet access enabled for image pulls, certificates, and APIs.
Do not open 5432, 5678, or 5679. For a VPS, use equivalent provider firewall rules.
If this server already uses ports 80/443, stop here and adapt its existing
reverse proxy instead of starting a second proxy on the same ports.

Use an Elastic IP for a stable AWS address, or update DNS whenever a
stop/start changes the public IP. Public IPv4, storage, and the instance can
incur separate charges; this guide does not assume Free Tier coverage.

## 2. Connect from your laptop

Replace `key.pem` and `PUBLIC_IPV4` with your own values:

```bash
chmod 400 /path/to/key.pem
ssh -i /path/to/key.pem ubuntu@PUBLIC_IPV4
```

The remaining commands in step 3 run **inside the Ubuntu server**.

## 3. Install Docker and Compose

On a fresh Ubuntu 24.04 server, use Docker's official apt repository:

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc

sudo tee /etc/apt/sources.list.d/docker.sources >/dev/null <<EOF
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: noble
Components: stable
Architectures: amd64
Signed-By: /etc/apt/keyrings/docker.asc
EOF

sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo systemctl enable --now docker
sudo docker run --rm hello-world
sudo docker compose version
```

These repository settings are specifically for Ubuntu 24.04 x86_64; use the
official instructions for a different OS/architecture. Commands below use
`sudo docker compose`, so adding your account to the Docker group is optional.

## 4. Point a new hostname to this server

Use your own subdomain or a new DuckDNS name, for example
`acs-n8n-yourname.duckdns.org`. Set its A record/current IP to this server's
public IPv4 address. Use a hostname separate from the current n8n Cloud URL.

From your laptop:

```bash
nslookup acs-n8n-yourname.duckdns.org
```

It should return this server's IP. Remove a stale AAAA record if you aren't
serving IPv6. Correct DNS and reachable ports 80/443 let Caddy issue and renew
HTTPS certificates automatically. With 443 restricted during owner setup,
certificate validation can use the public HTTP port 80.

## 5. Copy only this deployment folder

From the **project root on your laptop** (a second terminal):

```bash
ssh -i /path/to/key.pem ubuntu@PUBLIC_IPV4 'mkdir -p ~/acs-n8n'
scp -i /path/to/key.pem deploy/n8n/compose.yaml deploy/n8n/Caddyfile deploy/n8n/.env.example ubuntu@PUBLIC_IPV4:~/acs-n8n/
```

No app source, local `.env`, private key, or Cloud credentials need uploading.
In the **server SSH terminal**, create a fresh environment file:

```bash
cd ~/acs-n8n
umask 077
cp .env.example .env
openssl rand -hex 32
openssl rand -hex 32
openssl rand -hex 32
nano .env
```

Set `DOMAIN_NAME` to your new hostname, and `SSL_EMAIL` to your email. Put the
first random value in `N8N_ENCRYPTION_KEY`, the second in
`N8N_RUNNERS_AUTH_TOKEN`, and the third in `POSTGRES_PASSWORD`. Keep all three
image versions as provided for the first deployment. The hostname must not
include `https://` or a trailing slash.

If you copied the earlier SQLite deployment files but haven't configured or
started them, upload the updated `compose.yaml` and `.env.example` from this
folder first. Since your server `.env` is still unconfigured, you can copy the
updated template to `.env` and fill it in. There is no data migration needed
for an instance that hasn't started.

In nano: Ctrl+O, Enter to save; Ctrl+X to exit. Then:

```bash
chmod 600 .env
```

Use new secrets for this instance. Keep a secure backup of `.env`; changing
the encryption key after saving credentials makes those credentials unreadable.
Postgres reads `POSTGRES_PASSWORD` when it first initializes its volume;
editing `.env` alone does not change an existing database user's password.

## 6. Start and verify

Run from `~/acs-n8n` on the server:

```bash
sudo docker compose config --quiet
sudo docker compose pull
sudo docker compose up -d
sudo docker compose ps
sudo docker compose logs --tail=60 postgres n8n task-runners caddy
```

All four services should stay running; Postgres should show `healthy` before
n8n starts. `ps` should show published ports only for Caddy; bare `5678/tcp`
on n8n or `5432/tcp` on Postgres is an image-exposed port, not a host binding.
Allow time for database initialization, n8n startup, and certificate issuance.

After n8n starts, confirm its schema exists in PostgreSQL:

```bash
sudo docker compose exec -T postgres psql -U n8n -d n8n -c "SELECT to_regclass('public.workflow_entity') AS workflow_table;"
```

The result should be `workflow_entity`. This confirms n8n initialized its
Postgres tables rather than just starting an unrelated database service.

Open `https://YOUR_NEW_HOSTNAME` from the IP permitted on port 443 and create
the new owner account. Verify HTTPS and that the editor loads. Once the owner
exists, enable public 443 access if public webhooks are needed. Keep SSH
restricted to your IP. A first server check from your laptop is:

```bash
curl -fsS https://YOUR_NEW_HOSTNAME/healthz
```

Then build a tiny workflow **on this new instance**: Manual Trigger → Code
with `return [{ json: { ok: true } }];`. Execute it to confirm task-runner
connectivity. For a webhook test, create a new test workflow/path, use the
editor's test URL while listening, then test a published production URL.

The server is now deployed. Existing Cloud workflows and app traffic still
use the existing Cloud instance.

## 7. Keep Studio migration separate

Leave imported workflows unpublished while preparing the new instance. Active
schedules, queue sweepers, publishing jobs, and notifications can run twice if
both instances process the same app. Use a test app/environment for live tests.
Use a separate Telegram bot: activating the existing bot's trigger here would
replace its Telegram webhook and affect the current Cloud instance.

Before any later migration, account for these project details:

- `$vars` is a paid self-hosted feature. Container environment variables do not
  populate `$vars`. For Community Edition, configure the public Studio URL in
  the new workflows and store `x-acs-service-token` as a Header Auth credential.
  Keep secrets out of workflow JSON. Do not weaken environment access just to
  work around this difference.
- Recreate/reselect OpenAI and Telegram credentials on the new instance.
  Cloud-managed OpenAI credits are not a self-hosted API key.
- Include **SUB Telegram Send** in any later export. It is listed in
  `docs/ARCHITECTURE.md` but isn't included in the current export script's ID
  list. Remap Execute Sub-workflow references and error-workflow selections to
  the destination IDs after import.
- Leave the app's current `N8N_WEBHOOK_BASE_URL` unchanged. A future cutover
  would use `https://YOUR_NEW_HOSTNAME/webhook`, but is outside this guide.

## Operations

Run these in `~/acs-n8n` on the server:

```bash
sudo docker compose ps
sudo docker compose logs --tail=100 n8n
sudo docker stats --no-stream
df -h
```

To stop this stack while preserving its data: `sudo docker compose stop`.
To start it again: `sudo docker compose up -d`. Do not use `down -v`: that
deletes the persistent volumes, including workflows and credentials.

Back up both PostgreSQL and the n8n data directory. Stop n8n briefly to avoid
workflow writes during this pair of backups; keep Postgres running:

```bash
mkdir -p backups
chmod 700 backups
sudo docker compose stop n8n task-runners
sudo docker compose exec -T postgres pg_dump -U n8n -d n8n -Fc > "backups/n8n-postgres-$(date +%Y%m%d-%H%M%S).dump"
sudo docker compose run --rm --no-deps --user 0 --entrypoint tar n8n -czf - -C /home/node/.n8n . > "backups/n8n-data-$(date +%Y%m%d-%H%M%S).tgz"
sudo docker compose up -d
```

Check both backup commands succeeded and verify the dump/archive are readable
before relying on them. Store encrypted copies off the VPS along with `.env`
and the deployment files; database backups contain sensitive data. Caddy certificates live in
`caddy_data`, which should also be preserved when moving the server. Before
upgrades, back up first and review release notes; keep n8n and runners on the
same new version. An image downgrade alone may not reverse database migrations.

| Symptom | Check |
| --- | --- |
| SSH timeout | Instance public IP, SSH source IP rule, public subnet/internet route |
| Certificate error | DNS A/AAAA, public port 80, Caddy logs, port conflicts |
| 502 Bad Gateway | n8n startup/crash logs; Caddy targets `n8n:5678` |
| Database connection/authentication error | Postgres health/logs; password matches the initialized database role |
| Code task times out | Runner logs, matching image versions and shared token |
| Wrong webhook URL | `.env` hostname; recreate with `sudo docker compose up -d` |
| Restarting / killed process | `docker stats`, available RAM, free disk space |

## Official references

- [Docker Engine on Ubuntu](https://docs.docker.com/engine/install/ubuntu/)
- [n8n Docker Compose setup](https://docs.n8n.io/deploy/host-n8n/install-options/install-using-docker-compose)
- [n8n PostgreSQL configuration](https://docs.n8n.io/deploy/host-n8n/configure-n8n/choose-n8ns-database)
- [n8n reverse proxy settings](https://docs.n8n.io/deploy/host-n8n/configure-n8n/basic-configuration/configuration-examples/configure-webhook-urls-with-reverse-proxy)
- [n8n task runners](https://docs.n8n.io/deploy/host-n8n/configure-n8n/set-up-task-runners)
- [n8n variable availability](https://docs.n8n.io/build/code-in-n8n/cookbook/built-in-methods-and-variables-examples/vars)
- [Caddy automatic HTTPS](https://caddyserver.com/docs/automatic-https)
- [EC2 security groups](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ec2-security-groups.html)
