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
python -u init_db.py && python -u scripts/refresh_tv_upcoming_seasons_index.py --full --force --verify-min-items 1
```

**Start Command**
```bash
gunicorn app:app
```

**Required env vars**
- `DATABASE_URL`
- `TMDB_BEARER_TOKEN`
- `ADMIN_REFRESH_TOKEN`

**Optional env vars**
- `TMDB_UPCOMING_LANGUAGES`
- `TMDB_UPCOMING_FULL_REBUILD_TOP_RATED_PAGES`
- `TMDB_UPCOMING_FULL_REBUILD_AIRING_TODAY_PAGES`
- `TMDB_UPCOMING_FULL_REBUILD_TRENDING_PAGES`
