# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Taskly: a task manager (Laravel 13 API + Vue 3/TypeScript SPA + PostgreSQL): kanban/list views, labels, checklists, recurring tasks, soft-delete + undo, due-date reminders, per-user settings. See README.md for the feature list and API table.

## Environment: everything runs in Docker

The host has no PHP/Composer/Postgres and only Node 14 (too old for Vite). Always use containers. Host ports: app **8000**, Vite **5173**, Postgres **5433** (5432 is taken by an unrelated local Postgres; ports 80/443 belong to unrelated `laravel_*` containers - don't touch them).

```bash
# Day-to-day (wrappers around docker compose; they set HOST_UID/HOST_GID for you):
npm run serve --ignore-scripts=false       # db + app + scheduler -> http://localhost:8000 (uses the built assets in public/build)
npm run start:dev --ignore-scripts=false   # same + Vite HMR on :5173
npm run stop --ignore-scripts=false        # stop everything and delete public/hot
npm run logs --ignore-scripts=false
npm run typecheck|lint|format:check|test --ignore-scripts=false   # frontend gates (all must pass; CI runs them)
npm run e2e:fast --ignore-scripts=false    # Playwright on an ISOLATED instance (:8001, DB taskmanager_e2e); `e2e` adds the ~90s reminder test
# The flag is needed because the project .npmrc sets ignore-scripts=true (supply-chain hardening from the
# Laravel starter) and npm 6 on this host then refuses to run ANY `npm run` script. Don't delete .npmrc.

# (npm scripts below set HOST_UID/HOST_GID for you; for raw docker compose: export HOST_UID=$(id -u) HOST_GID=$(id -g))
docker compose up -d --build                 # db + app (:8000) + scheduler
docker compose run --rm app composer install
docker compose run --rm app php artisan migrate --seed   # demo@example.com / password
docker compose run --rm app php artisan test             # all PHP tests
docker compose run --rm app php artisan test --filter=ReminderTest   # one class / method name
docker compose run --rm app vendor/bin/pint              # PHP formatting
docker run --rm -u $(id -u):$(id -g) -e HOME=/tmp -v "$PWD":/app -w /app node:22-alpine npm run typecheck   # vue-tsc only, no build
docker compose run --rm app php artisan key:generate     # only if APP_KEY is empty in .env (fresh clone)

# Frontend (Node 22 container). Build output goes to public/build and is what :8000 serves.
docker run --rm -u $(id -u):$(id -g) -e HOME=/tmp -v "$PWD":/app -w /app node:22-alpine npm run build   # vue-tsc + vite build
docker compose --profile dev up -d vite      # HMR dev server; writes public/hot (delete it if vite dies, or pages break; `npm run stop` does this). vite.config.ts pins `server.origin` to localhost and `server.cors` to localhost origins - without both, the page on :8000 can't load modules from :5173
```

## Architecture

- **API** (`routes/api.php`, `app/Http/Controllers/Api/*`): Sanctum *personal access tokens* (not cookie/SPA auth). The SPA keeps the token in `localStorage` and sends `Authorization: Bearer`. All task queries go through `$request->user()->tasks()`, so other users' tasks 404 rather than 403.
- **SPA shell**: `routes/web.php` renders `resources/views/app.blade.php` for every non-`/api` URL; Vue Router handles the rest. Entry is `resources/js/app.ts`; `@` aliases `resources/js`.
- **Frontend state** (`resources/js/stores`, Pinia): `auth` (token + `/me` bootstrap, the router guard awaits `auth.init()`), `tasks` (full list loaded once; filtering/search is client-side; `move()` is optimistic with rollback), `notifications` (polls every 20s, toasts + browser Notification), `toasts`. `lib/api.ts` is the only fetch wrapper; a 401 with a token clears auth via a registered handler.
- **Task ordering**: `position` is per-status-column. `POST /tasks/{id}/move` takes `{status, position}` where position is the index in the target column *excluding the moved task* (the kanban drop-index math in `KanbanColumn.vue` matches this). The endpoint returns the full renumbered task list.
- **Task model hooks** (`Task::booted`): `completed_at` follows `status`; changing `remind_at` resets `reminded_at` so the reminder re-arms.
- **Reminders**: `routes/console.php` schedules `tasks:send-reminders` every minute; the `scheduler` compose service runs `schedule:work`. The command claims each task with an atomic `UPDATE ... WHERE reminded_at IS NULL` before notifying (no double sends), then sends `TaskReminder` via `database` + `mail` (mail driver is `log` -> `storage/logs/laravel.log`). Done tasks never remind. Notifications are not queued, so no queue worker is needed.
- **Times** are stored as UTC `timestamptz` and sent as ISO-8601; the browser converts to/from local time (`lib/dates.ts`, `datetime-local` inputs).

### Domain notes (added features)

- **Recurrence** (`app/Services/RecurrenceService.php`): called by `TaskController::update`/`move` only on a transition *into* done. An atomic claim on `tasks.recurred_at` guarantees one follow-up per completion (reopen + re-complete never duplicates). Dates are rolled forward from the original due/reminder to the first future occurrence, computed in the *user's* time zone (keeps wall-clock time across DST; monthly uses `addMonthsNoOverflow` from the original date so Jan 31 -> Feb 28 -> Mar 31). `PATCH /tasks/{id}` returns `spawned`.
- **Soft deletes**: `DELETE /tasks/{id}` soft-deletes; `POST /tasks/{id}/restore` is the Undo; `model:prune` (scheduled daily) purges after 30 days. Account deletion force-deletes trashed tasks too.
- **Labels** are per-user with a case-insensitive unique index (`lower(name)`); the form request mirrors it with a closure rule. `label_ids` / `checklist` on task create/update are *full replacements* when present, untouched when omitted.
- **Checklist sync gotcha**: `FormRequest::validated()` rebuilds arrays in *rule order*, so items with an `id` come out before items without. `TaskController::syncRelations` `ksort`s by the original index before using it as `position` (regression-tested in `ChecklistTest`).
- **Rate limits** are named limiters (`auth`, `api`) in `AppServiceProvider`, tunable via `AUTH_THROTTLE_PER_MINUTE` / `API_THROTTLE_PER_MINUTE`. Login also has a per-email+IP lockout (5 failures -> 429) in `AuthController`.
- **Snooze**: `POST /tasks/{id}/snooze` sets `remind_at` (the model hook re-arms `reminded_at`) and calls `Task::clearUnreadReminders()`. `GET /notifications` hides reminders whose task is done/deleted and attaches a live `task` summary (title, priority, due_at) so the bell can show Done / Snooze actions. Snooze presets and reminder lead times live in `lib/dates.ts` (pure, unit-tested).
- **Quick add** (`lib/quickAdd.ts`): pure parser with an injected `now`; never consumes the whole input; only matches existing labels; bare weekday abbreviations (sat, sun, mon) are NOT parsed unless after on/next. The agenda (`AgendaView.vue`) places a task by `due_at`, else an *upcoming* reminder; a fired reminder alone is not "overdue".
- **Design tokens**: `app.css` defines the `ink` (neutral) and `accent` scales plus `.btn/.field/.card/.popover/.check` primitives; use those, never raw slate/indigo. Icons come from `components/Icon.vue` (no emoji as icons). Font is self-hosted Geist (`@fontsource-variable/geist`). New UI defaults to the Agenda view; e2e fixtures pre-select Board via `localStorage['taskly.view']`.
- **Production deploy** (`Dockerfile.prod`, `docker-compose.prod.yml`, `deploy/*`): FrankenPHP image (Caddy+PHP, non-root), `app` (runs migrations via `RUN_MIGRATIONS=1`), `scheduler`, `db`. Config comes from `.env.production` (git-ignored; template `.env.production.example`). `SITE_ADDRESS=:80` = HTTP on an IP, a domain = automatic HTTPS. Only `app` has a `build:` (two services building one tag collides). To test locally use `ENV_FILE=… HTTP_PORT=8080 HTTPS_PORT=8443 docker compose -f docker-compose.prod.yml --env-file … up -d --build` (ports 80/443 on this host belong to other containers). Caddy uses Go RE2: no lookahead in `path_regexp`. See `docs/DEPLOY.md`.
- **Theme**: class-based dark mode (`@custom-variant dark` in `app.css`); an inline script in `app.blade.php` applies the saved theme before first paint; `lib/theme.ts` owns the logic.
- **Dialogs** use `lib/focusTrap.ts` (trap, scroll lock, focus restore). Keep color pairings AA-compliant - `e2e/a11y.spec.ts` runs axe over every screen in light and dark.

### E2E environment

`docker compose --profile e2e` runs `app-e2e` (:8001) and `scheduler-e2e` with `APP_ENV=e2e`, which makes Laravel load `.env.e2e` (database `taskmanager_e2e`, relaxed throttles). `docker/e2e-entrypoint.sh` refuses to run unless the DB name ends in `_e2e` because it starts with `migrate:fresh`. `APP_KEY` in `.env.e2e` is a throwaway on purpose: `artisan serve` blanks real env vars for its worker, so the key must be in the file. Playwright fixtures register one throw-away user per worker and wipe its data before each test.

## Gotchas

- `.env` uses `DB_HOST=db`, `DB_PORT=5432` (container values) because `php artisan serve` does **not** forward compose env vars to its worker process. From the host, Postgres is `localhost:5433`.
- **Tests use a separate DB** `taskmanager_test` (created by `docker/postgres/init-test-db.sql`, only on a fresh volume - otherwise `CREATE DATABASE taskmanager_test` manually). `phpunit.xml` forces `DB_*` via both `<env>` and `<server>` (Laravel reads `$_SERVER` first, so `<env>` alone silently hit the dev DB), and `tests/TestCase.php` fails any test whose DB name doesn't end in `_test`. Keep both safeguards.
- A task `PATCH` with a stale in-memory model won't null `reminded_at` (dirty-checking); the controller always loads fresh, but tests should `refresh()` first.
- `php artisan serve` blanks real env vars for its worker process (only the env file is read) - this is why compose `environment:` overrides don't reach web requests.
- `.npmrc` has `ignore-scripts=true`; npm 6 (host) then silently refuses `npm run` unless you pass `--ignore-scripts=false`.
- `npm audit` flags `picomatch` (ReDoS, range `<=4.0.7` = every release) in dev tooling; nothing to fix. Production deps are clean; never run `npm audit fix --force` (it suggests downgrades).
- HTML5 drag & drop doesn't work on touch devices; the UI defaults to the list view below 768px, where status is changed via a select.
- `AGENTS.md` is a duplicate of this file; keep the two in sync when editing either.
