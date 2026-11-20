# Taskly

A fast, polished task manager. Plan work on a **kanban board** or a **list**, break tasks into **checklists**, organise with **labels**, repeat the boring ones automatically, and get **reminders** in the app, on your desktop and by email.

**Stack:** Laravel 13 (Sanctum token auth) · Vue 3 + TypeScript + Pinia + Vue Router · Tailwind CSS 4 · PostgreSQL 16 · Vite · Docker.

## Features

- **Tasks** — title, description, priority, due date, reminder time; three statuses (To do · In progress · Done)
- **Board & list views** — drag & drop between and within columns (order persists); the list view has a status dropdown and works on touch devices
- **Checklists** inside tasks, with progress on the card and reordering
- **Labels** — coloured, created inline or managed in Settings; filter the board by label
- **Recurring tasks** — daily / weekly / monthly. Completing one creates the next occurrence (keeps labels, resets the checklist, rolls overdue dates forward, respects your time zone across DST)
- **Reminders** — a scheduler checks every minute. You get an in-app toast + bell badge, an optional desktop notification and an email (per-user opt-out). The unread count also shows in the browser tab title
- **Snooze** — from the bell, a reminder toast (one-tap "Snooze 10 min") or any agenda/list row: 10 min, 1 hour, later today, tomorrow, next week. Snoozing re-arms the reminder; "Done" completes the task right from the bell. Reminders for tasks you finished or deleted disappear on their own
- **Agenda view** — open tasks grouped by day (Overdue · Today · Tomorrow · each weekday · Later · No date); the default view. Board and List are one click away
- **Quick add** — type `Call mom tomorrow 5pm !high #family every week` and dates, times, priority, existing labels and repeats are understood as you type (live preview); the reminder is set for the due time
- **Reminder presets** — in the task form, set a reminder *at due time*, *10 min / 1 hour / 1 day before*, or in 1 hour / tomorrow 9:00
- **Undo delete** — deletes are soft; "Undo" restores the task. Trash is purged after 30 days
- **Search & filters** — text, priority, label, overdue; live summary (open / due today / overdue / done)
- **Accounts** — register / sign in, change password (signs out other devices), delete account, per-user time zone
- **UI** — light / dark / system theme, keyboard shortcuts (`n` new task, `a` quick add, `/` search, `Esc` close), focus-trapped dialogs, WCAG 2 AA audited
- **Security** — hashed passwords, token expiry, login lockout per email + IP, rate limits, security headers, strict per-user data isolation

## Quick start

Everything runs in Docker — no local PHP, Node or Postgres needed.

```bash
cp .env.example .env            # first time only
docker compose run --rm app composer install
docker compose run --rm app php artisan key:generate
docker run --rm -u $(id -u):$(id -g) -e HOME=/tmp -v "$PWD":/app -w /app node:22-alpine sh -c "npm ci && npm run build"
docker compose run --rm app php artisan migrate --seed

npm run serve --ignore-scripts=false     # → http://localhost:8000
```

Sign in with **demo@example.com / password**, or register.

> **Why `--ignore-scripts=false`?** The repo's `.npmrc` sets `ignore-scripts=true` (supply-chain hardening from the Laravel starter). On npm 6 that also blocks `npm run`. With npm 7+ you can drop the flag.

### Everyday commands

| Command (prefix `npm run`, flag as above) | What it does |
| --- | --- |
| `serve` | start db + app + reminder scheduler on :8000 |
| `start:dev` | same, plus Vite hot reload on :5173 |
| `stop` / `logs` | stop everything / follow logs |
| `build` | typecheck + production build into `public/build` *(run via the Node container)* |
| `typecheck` · `lint` · `format` · `format:check` | TypeScript, ESLint, Prettier |
| `test` | frontend unit tests (Vitest) |
| `e2e` / `e2e:fast` | browser tests (Playwright) on an isolated instance; `:fast` skips the 90 s reminder test |

Backend: `docker compose run --rm app php artisan test` · `vendor/bin/pint` (format) · `--filter=ReminderTest` for one class.

Postgres is exposed on `localhost:5433` (`taskmanager` / `taskmanager` / `secret`). Inside Docker the app uses host `db`, port `5432` — see [Gotchas](#gotchas).

## Deploy

Production runs the same code in Docker (Caddy + PHP with automatic HTTPS, scheduler, PostgreSQL). On a fresh DigitalOcean droplet it is one command; see **[docs/DEPLOY.md](docs/DEPLOY.md)**.

## Testing

| Layer | Tool | Where |
| --- | --- | --- |
| API & domain | PHPUnit (~60 tests, real Postgres `taskmanager_test`) | `tests/Feature` |
| Frontend units | Vitest + Vue Test Utils | `resources/js/**/*.test.ts` |
| Browser | Playwright + axe-core (light & dark) | `e2e/` |

The browser suite runs against its **own app instance and database** (`taskmanager_e2e`, port 8001, config in `.env.e2e`), so your development data is never touched. CI (`.github/workflows/ci.yml`) runs everything on each push.

## Configuration

| Variable | Default | Meaning |
| --- | --- | --- |
| `AUTH_THROTTLE_PER_MINUTE` | `20` | register/login requests per IP |
| `API_THROTTLE_PER_MINUTE` | `240` | authenticated API requests per user |
| `SANCTUM_TOKEN_EXPIRATION` | `43200` | token lifetime in minutes (30 days) |
| `MAIL_*` | `log` driver | set a real mailer to deliver reminder emails; by default they are written to `storage/logs/laravel.log` |

## API

All endpoints are under `/api`, JSON in/out, `Authorization: Bearer <token>` (except register/login).

| Method & path | Purpose |
| --- | --- |
| `POST /register`, `POST /login`, `POST /logout` | auth (login is locked out after 5 failures per email + IP) |
| `GET /me`, `PATCH /me` | profile (name, email, timezone, email_reminders) |
| `PUT /me/password`, `DELETE /me` | change password (revokes other tokens) / delete account |
| `GET /tasks` | list (`status`, `priority`, `label_id`, `search`, `overdue` filters) |
| `POST /tasks`, `GET\|PATCH\|DELETE /tasks/{id}` | CRUD; PATCH accepts `label_ids` and `checklist` (full replacement) and returns `spawned` when completing a recurring task |
| `POST /tasks/{id}/move` | `{status, position}` drag & drop; returns the renumbered list |
| `POST /tasks/{id}/restore` | undo a delete |
| `POST /tasks/{id}/snooze` | `{until}` (future, within a year): re-arms the reminder for that time and marks the task's unread reminders read; 422 for completed tasks |
| `GET\|POST /labels`, `PATCH\|DELETE /labels/{id}` | labels |
| `GET /notifications`, `POST /notifications/{id}/read`, `POST /notifications/read-all` | unread reminders |

Validation errors are Laravel's standard `422 {message, errors}`.

## Architecture in brief

- **Backend** — thin controllers + form requests; `RecurrenceService` owns the next-occurrence logic; the `tasks:send-reminders` command claims each task with an atomic `UPDATE … WHERE reminded_at IS NULL` before notifying, so overlapping runs never double-send. Times are UTC `timestamptz`.
- **Frontend** — Pinia stores (`auth`, `tasks`, `labels`, `notifications`, `toasts`) behind a single fetch wrapper; the whole task list is loaded once and filtered client-side; moves are optimistic with rollback.
- **Reminders** — `scheduler` service runs `schedule:work`; the SPA polls `/notifications` every 20 s.

See `CLAUDE.md` for contributor/agent notes.

## Gotchas

- `.env` uses `DB_HOST=db`, `DB_PORT=5432`. `php artisan serve` **blanks real env vars** for its worker (it only reads the env file), so compose-level overrides do not apply to web requests.
- Tests refuse to run against a database not ending in `_test` (`tests/TestCase.php`) and `phpunit.xml` forces the test DB through both `<env>` and `<server>`.
- `public/hot` left behind by a crashed Vite dev server breaks the page — `npm run stop` removes it.
- `npm audit` currently reports a `picomatch` ReDoS in dev tooling with no patched release; production dependencies are clean and CI gates on those.

## Not included (ideas)

Password-reset emails, OAuth/SSO, real-time push (WebSockets) instead of polling, file attachments, shared/team workspaces, a production container image and reverse-proxy setup.
