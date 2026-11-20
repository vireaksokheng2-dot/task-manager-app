#!/usr/bin/env bash
# Pull the latest code and redeploy. Database and uploads live in Docker volumes and are untouched;
# new migrations run automatically when the web container starts.
set -euo pipefail
cd "$(dirname "$0")/.."
git pull --ff-only
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
docker image prune -f >/dev/null
echo "Updated. Status:"
docker compose -f docker-compose.prod.yml --env-file .env.production ps
