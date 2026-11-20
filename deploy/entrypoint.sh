#!/bin/sh
# Container entrypoint for the web app and the scheduler.
set -eu

if [ -z "${APP_KEY:-}" ]; then
    echo "APP_KEY is not set. Generate one with:  echo base64:\$(openssl rand -base64 32)" >&2
    exit 1
fi

# Only the web container migrates (the scheduler starts after it, see docker-compose.prod.yml).
if [ "${RUN_MIGRATIONS:-0}" = "1" ]; then
    php artisan migrate --force --no-interaction
fi

php artisan config:cache --no-interaction
php artisan route:cache --no-interaction
php artisan view:cache --no-interaction
php artisan event:cache --no-interaction

exec "$@"
