# Deploying Taskly on DigitalOcean

One small server runs everything: the web app (Caddy + PHP, automatic HTTPS), the reminder
scheduler and PostgreSQL, all in Docker. It is the same code you run locally; only the container
image differs (`Dockerfile.prod`, `docker-compose.prod.yml`).

## 1. Create the droplet (≈5 minutes)

1. [cloud.digitalocean.com](https://cloud.digitalocean.com) → **Create → Droplets**.
2. **Region:** the one closest to you (Singapore `SGP1` for Cambodia).
3. **Image:** *Ubuntu 24.04 LTS* (the Marketplace "Docker" image also works).
4. **Size:** *Basic → Regular (shared CPU)*, **1 GB RAM** is enough to run it (about $6/month — check current
   pricing). Building the image on 1 GB uses swap and is slower; if a build is ever killed for lack of
   memory, resize to 2 GB.
5. **Authentication:** an **SSH key** (recommended) or a password. Add backups (+20%) if you want automatic weekly snapshots.
6. Create it and copy the droplet's **IPv4 address**.

## 2. (Optional) point a domain at it

Skip this to start on the IP address over plain HTTP. For HTTPS you need a domain:

- At your DNS provider (or DigitalOcean **Networking → Domains**) add an **A record**: `taskly.yourdomain.com → <droplet IP>`.
- Wait until `ping taskly.yourdomain.com` shows the droplet IP.

## 3. Run the installer on the droplet

```bash
ssh root@<droplet-ip>

# IP only (plain HTTP):
curl -fsSL https://raw.githubusercontent.com/vireaksokheng2-dot/task-manager-app/main/deploy/bootstrap.sh | bash

# or with a domain (automatic HTTPS):
curl -fsSL https://raw.githubusercontent.com/vireaksokheng2-dot/task-manager-app/main/deploy/bootstrap.sh | DOMAIN=taskly.yourdomain.com bash
```

It installs Docker, clones the repo to `/opt/taskly`, generates `.env.production` (new `APP_KEY` and
database password), enables a firewall (SSH/80/443 only), builds and starts everything. The first build takes a few
minutes. When it finishes it prints the URL — open it and **register your account** (no demo user is created in production).

## 4. Make the reminder emails real (optional)

By default reminder emails are only written to a log (in-app and desktop reminders always work). To email people,
edit `/opt/taskly/.env.production`, set `MAIL_MAILER=smtp` and the `MAIL_*` values from an email provider
(Brevo, Mailgun, Resend, Postmark, …), then:

```bash
cd /opt/taskly && docker compose -f docker-compose.prod.yml --env-file .env.production up -d
```

## Day-to-day

| Task | Command (on the droplet) |
| --- | --- |
| Deploy the latest code | `/opt/taskly/deploy/update.sh` |
| See status | `cd /opt/taskly && docker compose -f docker-compose.prod.yml --env-file .env.production ps` |
| Logs | `… logs -f app` (or `scheduler`, `db`) |
| Back up the database | `/opt/taskly/deploy/backup.sh` → `/var/backups/taskly` (keeps 14 days) |
| Daily backup at 03:17 | `crontab -e` → `17 3 * * * /opt/taskly/deploy/backup.sh` |
| Restore a backup | see the header of `deploy/backup.sh` |

Data lives in Docker volumes (`taskly_pgdata`, `taskly_storage`), so redeploys and reboots keep it. Containers use
`restart: unless-stopped`, so everything comes back after a reboot.

## Things to know

- **Sign-up is open.** Anyone who finds the URL can create an account (it is rate-limited). If this is for you alone,
  register, then restrict access (e.g. a DigitalOcean Cloud Firewall allowing only your IP, or a VPN).
- **Plain HTTP on an IP is not private.** Passwords and tokens would travel unencrypted. Use a domain (HTTPS) for anything real.
- **Secrets.** `.env.production` is created with mode 600 and is git-ignored. Keep a copy of `APP_KEY`; losing it logs everyone out.
- **Verified locally.** The production image was built and exercised end to end (pages, assets, caching headers, auth, snooze, the
  scheduler firing a real reminder, restart persistence) before this guide was written. It has **not** been run on a real
  droplet from this repo yet — if the installer prints an error, send it over.
