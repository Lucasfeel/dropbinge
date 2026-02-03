import datetime
import hashlib
import os
from typing import Optional

from flask import current_app, has_app_context
from psycopg2.extras import Json

from database import get_db, managed_cursor

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


SEARCH_TTL_SECONDS = _env_int("TMDB_CACHE_TTL_SEARCH_SECONDS", 6 * 60 * 60)
LIST_TTL_SECONDS = _env_int("TMDB_CACHE_TTL_LIST_SECONDS", 24 * 60 * 60)
MOVIE_TTL_SECONDS = _env_int("TMDB_CACHE_TTL_MOVIE_SECONDS", 7 * 24 * 60 * 60)
TV_TTL_SECONDS = _env_int("TMDB_CACHE_TTL_TV_SECONDS", 24 * 60 * 60)
SEASON_TTL_SECONDS = _env_int("TMDB_CACHE_TTL_SEASON_SECONDS", 24 * 60 * 60)
WATCH_PROVIDERS_TTL_SECONDS = _env_int("TMDB_CACHE_TTL_WATCH_SECONDS", 24 * 60 * 60)

_memory_cache = {}


def _use_memory_cache():
    # Background threads (e.g., ThreadPoolExecutor workers) lack Flask app context.
    # Fall back to memory cache to avoid accessing flask.g in DB cache.
    if not has_app_context():
        return True
    if os.getenv("FLASK_ENV") == "testing":
        return True
    if has_app_context() and current_app.testing:
        return True
    if not os.getenv("DATABASE_URL"):
        required_vars = ["DB_NAME", "DB_USER", "DB_PASSWORD", "DB_HOST", "DB_PORT"]
        if not all(os.getenv(var) for var in required_vars):
            return True
    return False


def normalize_query(text):
    return " ".join(text.strip().split()).lower()


def stable_bigint_hash(text):
    digest = hashlib.sha256(text.encode("utf-8")).digest()
    return int.from_bytes(digest[:8], byteorder="big", signed=True)


def make_cache_key(kind, *, tmdb_id=None, season_number=-1, query_key=None):
    if query_key is not None and tmdb_id is None:
        tmdb_id = stable_bigint_hash(query_key)
    if tmdb_id is None:
        raise ValueError("tmdb_id is required when query_key is not provided")
    return kind, int(tmdb_id), int(season_number)


def _memory_key(media_type, tmdb_id, season_number):
    return (media_type, int(tmdb_id), int(season_number))


def get_cached(conn, media_type, tmdb_id, season_number) -> Optional[dict]:
    if _use_memory_cache():
        key = _memory_key(media_type, tmdb_id, season_number)
        entry = _memory_cache.get(key)
        if not entry:
            return None
        expires_at = entry.get("expires_at")
        if not expires_at or expires_at <= datetime.datetime.utcnow():
            _memory_cache.pop(key, None)
            return None
        return entry.get("payload")

    db = conn or get_db()
    with managed_cursor(db) as cursor:
        cursor.execute(
            """
            SELECT payload
            FROM tmdb_cache
            WHERE media_type = %s
              AND tmdb_id = %s
              AND season_number = %s
              AND expires_at IS NOT NULL
              AND expires_at > timezone('utc', now())
            LIMIT 1
            """,
            (media_type, tmdb_id, season_number),
        )
        row = cursor.fetchone()
    if not row:
        return None
    return row.get("payload")


def set_cached(conn, media_type, tmdb_id, season_number, payload, ttl_seconds) -> None:
    expires_at = datetime.datetime.utcnow() + datetime.timedelta(seconds=ttl_seconds)
    if _use_memory_cache():
        key = _memory_key(media_type, tmdb_id, season_number)
        _memory_cache[key] = {"payload": payload, "expires_at": expires_at}
        return

    db = conn or get_db()
    with managed_cursor(db) as cursor:
        cursor.execute(
            """
            INSERT INTO tmdb_cache (
                media_type,
                tmdb_id,
                season_number,
                payload,
                fetched_at,
                expires_at
            )
            VALUES (%s, %s, %s, %s, NOW(), %s)
            ON CONFLICT (media_type, tmdb_id, season_number)
            DO UPDATE SET
                payload = EXCLUDED.payload,
                fetched_at = EXCLUDED.fetched_at,
                expires_at = EXCLUDED.expires_at
            """,
            (media_type, tmdb_id, season_number, Json(payload), expires_at),
        )
    db.commit()
