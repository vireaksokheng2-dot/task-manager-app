#!/usr/bin/env bash
# Runs the Playwright suite against an isolated instance (:8001, database taskmanager_e2e),
# so your development data is never touched. Extra args go to `playwright test`.
#   npm run e2e                 # everything (includes the ~90s live-reminder test)
#   npm run e2e:fast            # skips the slow reminder test
#   E2E_MOTION=1 npm run e2e:fast   # same, with animations enabled (default is reduced motion)
#   npm run e2e -- e2e/tasks.spec.ts -g "drag"
set -euo pipefail
cd "$(dirname "$0")/.."

export HOST_UID="${HOST_UID:-$(id -u)}" HOST_GID="${HOST_GID:-$(id -g)}"
PORT=8001
PLAYWRIGHT_IMAGE="mcr.microsoft.com/playwright:v1.56.1-noble"

cleanup() { docker compose --profile e2e stop app-e2e scheduler-e2e >/dev/null 2>&1 || true; }
trap cleanup EXIT

echo "› starting the e2e instance on :$PORT"
docker compose --profile e2e up -d --build db app-e2e scheduler-e2e >/dev/null

for _ in $(seq 1 60); do
    curl -fs "http://localhost:$PORT/up" >/dev/null 2>&1 && break
    sleep 1
done
curl -fs "http://localhost:$PORT/up" >/dev/null || { docker compose --profile e2e logs app-e2e | tail -30; echo "e2e instance did not become healthy" >&2; exit 1; }

echo "› running Playwright"
docker run --rm --network host --ipc=host \
    -u "$HOST_UID:$HOST_GID" -e HOME=/tmp \
    -e E2E_BASE_URL="http://localhost:$PORT" -e E2E_MOTION="${E2E_MOTION:-}" -e E2E_SKIP_SLOW="${E2E_SKIP_SLOW:-}" -e CI="${CI:-}" \
    -v "$PWD":/app -w /app "$PLAYWRIGHT_IMAGE" \
    npx playwright test "$@"
