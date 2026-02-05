import json
import os


def _parse_cors_allow_origins(raw_value):
    if raw_value is None:
        return None
    stripped = raw_value.strip()
    if not stripped:
        return None
    try:
        parsed = json.loads(stripped)
    except json.JSONDecodeError:
        parsed = None
    if isinstance(parsed, list):
        return [item.strip() for item in parsed if isinstance(item, str) and item.strip()]
    return [item.strip() for item in stripped.split(",") if item.strip()]


CORS_ALLOW_ORIGINS = _parse_cors_allow_origins(os.getenv("CORS_ALLOW_ORIGINS"))
CORS_SUPPORTS_CREDENTIALS = os.getenv("CORS_SUPPORTS_CREDENTIALS", "0") == "1"

JWT_SECRET = os.getenv("JWT_SECRET", "dev-secret-change-me")

TMDB_BEARER_TOKEN = os.getenv("TMDB_BEARER_TOKEN")
TMDB_API_KEY = os.getenv("TMDB_API_KEY")


def _env_int(name, default):
    raw = os.getenv(name)
    if raw is None:
        return default
    try:
        value = int(raw)
    except ValueError:
        return default
    if value <= 0:
        return default
    return value


ADMIN_REFRESH_TOKEN = os.getenv("ADMIN_REFRESH_TOKEN")
TMDB_CACHE_TTL_TV_UPCOMING_INDEX_SECONDS = _env_int(
    "TMDB_CACHE_TTL_TV_UPCOMING_INDEX_SECONDS", 7 * 24 * 60 * 60
)
TMDB_UPCOMING_CHANGES_LOOKBACK_DAYS = _env_int("TMDB_UPCOMING_CHANGES_LOOKBACK_DAYS", 7)
TMDB_UPCOMING_MAX_ITEMS = _env_int("TMDB_UPCOMING_MAX_ITEMS", 4000)
TMDB_UPCOMING_DETAIL_WORKERS = _env_int("TMDB_UPCOMING_DETAIL_WORKERS", 4)
TMDB_UPCOMING_FULL_REBUILD_POPULAR_PAGES = _env_int(
    "TMDB_UPCOMING_FULL_REBUILD_POPULAR_PAGES", 120
)
TMDB_UPCOMING_FULL_REBUILD_ON_THE_AIR_PAGES = _env_int(
    "TMDB_UPCOMING_FULL_REBUILD_ON_THE_AIR_PAGES", 120
)
TMDB_UPCOMING_FULL_REBUILD_TOP_RATED_PAGES = _env_int(
    "TMDB_UPCOMING_FULL_REBUILD_TOP_RATED_PAGES", 120
)
TMDB_UPCOMING_FULL_REBUILD_AIRING_TODAY_PAGES = _env_int(
    "TMDB_UPCOMING_FULL_REBUILD_AIRING_TODAY_PAGES", 120
)
TMDB_UPCOMING_FULL_REBUILD_TRENDING_PAGES = _env_int(
    "TMDB_UPCOMING_FULL_REBUILD_TRENDING_PAGES", 40
)
