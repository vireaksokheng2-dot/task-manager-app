#!/usr/bin/env bash
# One-shot setup for a fresh Ubuntu server (e.g. a DigitalOcean droplet). Run as root:
#
#   curl -fsSL https://raw.githubusercontent.com/vireaksokheng2-dot/task-manager-app/main/deploy/bootstrap.sh | sudo bash
#   # with a domain (DNS A record must already point at this server):
#   curl -fsSL .../deploy/bootstrap.sh | sudo DOMAIN=taskly.example.com bash
#
# Safe to re-run: it never overwrites an existing .env.production, and it pulls + rebuilds.
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/vireaksokheng2-dot/task-manager-app.git}"
APP_DIR="${APP_DIR:-/opt/taskly}"
DOMAIN="${DOMAIN:-}"
COMPOSE=(docker compose -f docker-compose.prod.yml --env-file .env.production)

log() { printf '\n\033[1m› %s\033[0m\n' "$*"; }
die() { printf 'error: %s\n' "$*" >&2; exit 1; }

public_ip() {
    # DigitalOcean's link-local metadata service; falls back to the first local address.
    curl -fsS --max-time 3 http://169.254.169.254/metadata/v1/interfaces/public/0/ipv4/address 2>/dev/null \
        || hostname -I | awk '{print $1}'
}

# Writes .env.production unless it exists. Args: domain-or-empty, public-ip
write_env() {
    local domain="$1" ip="$2" site url
    [[ -f .env.production ]] && { echo ".env.production already exists - keeping it."; return; }
    if [[ -n "$domain" ]]; then site="$domain"; url="https://$domain"; else site=":80"; url="http://$ip"; fi
    umask 077
    sed -e "s|^APP_KEY=.*|APP_KEY=base64:$(openssl rand -base64 32)|" \
        -e "s|^DB_PASSWORD=.*|DB_PASSWORD=$(openssl rand -hex 24)|" \
        -e "s|^APP_URL=.*|APP_URL=$url|" \
        -e "s|^SITE_ADDRESS=.*|SITE_ADDRESS=$site|" \
        .env.production.example > .env.production
    chmod 600 .env.production
    echo "Wrote .env.production (new APP_KEY and database password generated)."
}

main() {
    [[ $EUID -eq 0 ]] || die "run as root (use sudo)"

    log "Installing prerequisites"
    export DEBIAN_FRONTEND=noninteractive
    apt-get update -qq
    apt-get install -y -qq git curl openssl ufw >/dev/null
    command -v docker >/dev/null || curl -fsSL https://get.docker.com | sh
    docker compose version >/dev/null 2>&1 || die "docker compose plugin missing"

    # Small droplets (1 GB) can run out of memory while building the frontend; a swap file prevents that.
    if [[ -z "$(swapon --show --noheadings)" ]]; then
        log "Adding 2 GB swap (no swap configured)"
        fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile >/dev/null && swapon /swapfile
        grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
    fi

    log "Fetching the code into $APP_DIR"
    if [[ -d "$APP_DIR/.git" ]]; then git -C "$APP_DIR" pull --ff-only; else git clone --depth 1 "$REPO_URL" "$APP_DIR"; fi
    cd "$APP_DIR"

    if [[ -z "$DOMAIN" && -t 0 ]]; then
        read -r -p "Domain name for HTTPS (leave empty to use the server IP over plain HTTP): " DOMAIN || true
    fi

    log "Configuring"
    write_env "$DOMAIN" "$(public_ip)"

    log "Firewall (SSH, HTTP, HTTPS only)"
    ufw allow OpenSSH >/dev/null
    ufw allow 80/tcp >/dev/null
    ufw allow 443 >/dev/null
    ufw --force enable >/dev/null

    log "Building and starting (first build takes a few minutes)"
    "${COMPOSE[@]}" up -d --build

    log "Waiting for the app to come up"
    for _ in $(seq 1 60); do
        curl -fsS http://127.0.0.1/up >/dev/null 2>&1 && break
        sleep 2
    done

    local url; url=$(grep '^APP_URL=' .env.production | cut -d= -f2-)
    echo
    echo "Taskly is running:  $url"
    echo "Create your account on that page (no demo user is created in production)."
    [[ -n "$DOMAIN" ]] && echo "HTTPS certificate is issued automatically on the first visit (may take ~30s)."
    echo "Update later with:  $APP_DIR/deploy/update.sh      Back up with:  $APP_DIR/deploy/backup.sh"
}

# `TASKLY_SOURCE_ONLY=1 source bootstrap.sh` loads the functions without running (used in tests).
[[ "${TASKLY_SOURCE_ONLY:-}" == "1" ]] || main "$@"
