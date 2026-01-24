# DropBinge (v0.9 MVP)

DropBinge tracks release date “drops,” status changes, and completion signals for movies and TV. It emphasizes TBD (missing dates) and supports both **TV seasons** and **full series run** tracking.

## Requirements
- Python 3.10+
- Postgres
- Node 18+ (for frontend dev/build)

## Environment Variables
- `DATABASE_URL` (preferred) **or** `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_HOST`, `DB_PORT`
- `JWT_SECRET`
- `TMDB_BEARER_TOKEN` (preferred) or `TMDB_API_KEY`
- `CORS_ALLOW_ORIGINS` (comma-separated or JSON list)

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

### Render Example
**Build Command**
```bash
pip install -r requirements.txt && python init_db.py && cd frontend && npm install && npm run build
```

**Start Command**
```bash
gunicorn app:app
```
