# DropBinge (v0.9 MVP)

DropBinge tracks release date “drops,” status changes, and completion signals for movies and TV. It emphasizes TBD (missing dates) and supports both **TV seasons** and **full series run** tracking.

## Requirements
- Python 3.10+
- Postgres
- Node 18+ (for frontend dev/build)

## Environment Variables
- `DATABASE_URL` (preferred) **or** `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_HOST`, `DB_PORT`
- `JWT_SECRET`
- `TMDB_READ_ACCESS_TOKEN` (preferred) or `TMDB_API_KEY`
- `CORS_ALLOW_ORIGINS` (comma-separated or JSON list)

### Email (optional)
- `EMAIL_ENABLED` (default: `false`)
- `EMAIL_FROM` (required when `EMAIL_ENABLED=true`)
- `EMAIL_REPLY_TO` (optional)
- `APP_BASE_URL` (used for deep links in emails)
- `SMTP_HOST` (required when `EMAIL_ENABLED=true`)
- `SMTP_PORT` (default: `587`)
- `SMTP_USER` (optional)
- `SMTP_PASSWORD` (optional)
- `SMTP_USE_TLS` (default: `true`, STARTTLS)
- `SMTP_USE_SSL` (default: `false`, SMTPS)
- `EMAIL_DISPATCH_BATCH_SIZE` (default: `25`)
- `EMAIL_DISPATCH_MAX_ATTEMPTS` (default: `5`)
- `EMAIL_DISPATCH_STALE_SENDING_MINUTES` (default: `15`)
- `EMAIL_DISPATCH_BACKOFF_BASE_SECONDS` (default: `60`)
- `EMAIL_DISPATCH_BACKOFF_MAX_SECONDS` (default: `3600`)
- `EMAIL_DISPATCH_DRY_RUN` (default: `false`)
- `EMAIL_DISPATCH_LOOP_SECONDS` (default: `30`)
- `CRON_SECRET` (required for internal cron endpoints)
- `CRON_DISPATCH_BATCH_SIZE` (default: `EMAIL_DISPATCH_BATCH_SIZE`)
- `CRON_REFRESH_LIMIT_USERS` (optional limit for internal refresh)
- `CRON_REFRESH_LIMIT_FOLLOWS` (optional limit for internal refresh)

To test email template rendering:
```bash
pytest -q tests/test_email_templates.py
```

Optional: for local SMTP testing you can use a tool like MailHog to capture outbound messages.

To run the email outbox dispatcher once:
```bash
python workers/dispatch_email_outbox.py --once
```

### Internal cron endpoints
The app exposes internal endpoints intended for scheduled triggers. Protect them with `CRON_SECRET` and send it as the `X-CRON-SECRET` header.

- `POST /api/internal/dispatch-email`
- `POST /api/internal/refresh-all?limit_users=...&limit_follows=...` (optional query limits)

If `CRON_SECRET` is not set, the endpoints return `503` with a configuration error. Invalid or missing headers return `401`.

### GitHub Actions scheduling (optional)
Use GitHub Actions to invoke the internal endpoints. Configure secrets:
- `CRON_SECRET`
- `CRON_DISPATCH_URL` (full URL to `/api/internal/dispatch-email`)
- `CRON_REFRESH_URL` (full URL to `/api/internal/refresh-all`)

Dispatch is idempotent via outbox unique keys; failures are retried with backoff and stale `sending` rows are requeued automatically.

TMDB `/api/tmdb` endpoints are server-side cached with TTLs and respect upstream 429 rate limiting responses.

## Backend Setup
```bash
pip install -r requirements.txt
python init_db.py
python app.py
```

For production:
```bash
gunicorn app:app
```

## Frontend Setup (Vite)
```bash
cd frontend
npm install
npm run dev
```

The Vite dev server proxies `/api` requests to the Flask backend (see `frontend/vite.config.ts`).

## Build for Production
```bash
cd frontend
npm install
npm run build
```

The build output goes to `frontend/dist`, which Flask serves automatically.

## Production (Docker)
```bash
docker build -t dropbinge .
docker run -e DATABASE_URL=... -e JWT_SECRET=... -e TMDB_BEARER_TOKEN=... -p 10000:10000 dropbinge
```
The Docker image includes the built React SPA, so no Node runtime is required in production.

## Render Example
**Preferred: Docker deployment**
- Use the Dockerfile in this repo for build and start; it serves the built frontend via Flask.

**If not using Docker (Build/Start Commands)**
```bash
pip install -r requirements.txt && python init_db.py && cd frontend && npm install && npm run build
```

**Pre-Deploy Command**
```bash
python -u init_db.py
```

**Start Command**
```bash
gunicorn app:app
```

**Required env vars**
- `DATABASE_URL`
- `TMDB_BEARER_TOKEN`
