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

