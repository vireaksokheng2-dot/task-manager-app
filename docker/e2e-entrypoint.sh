#!/bin/sh
# Boots the isolated end-to-end instance. Refuses to run against anything but a *_e2e database,
# because it starts with `migrate:fresh`.
set -eu

DB=$(php -r '
    require "vendor/autoload.php";
    $app = require "bootstrap/app.php";
    $app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
    echo config("database.connections." . config("database.default") . ".database");
')

case "$DB" in
    *_e2e) ;;
    *) echo "Refusing to start: database [$DB] does not end in _e2e" >&2; exit 1 ;;
esac

# Create the database on first use (works on volumes created before it was added to the init script).
php -r '
    $host = getenv("DB_HOST") ?: "db"; $db = $argv[1];
    $pdo = new PDO("pgsql:host=$host;port=5432;dbname=postgres", "taskmanager", "secret");
    $exists = $pdo->query("SELECT 1 FROM pg_database WHERE datname = " . $pdo->quote($db))->fetchColumn();
    if (!$exists) { $pdo->exec("CREATE DATABASE \"$db\" OWNER taskmanager"); echo "created $db\n"; }
' "$DB"

php artisan migrate:fresh --force --no-interaction
exec "$@"
