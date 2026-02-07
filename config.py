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


def _env_bool(name, default=False):
    raw = os.getenv(name)
    if raw is None:
        return default
    normalized = raw.strip().lower()
    if normalized in ("1", "true", "yes", "on"):
        return True
    if normalized in ("0", "false", "no", "off"):
        return False
    return default


EMAIL_ENABLED = _env_bool("EMAIL_ENABLED", False)
EMAIL_FROM = os.getenv("EMAIL_FROM")
EMAIL_REPLY_TO = os.getenv("EMAIL_REPLY_TO")
APP_BASE_URL = os.getenv("APP_BASE_URL")

SMTP_HOST = os.getenv("SMTP_HOST")
SMTP_PORT = _env_int("SMTP_PORT", 587)
SMTP_USER = os.getenv("SMTP_USER")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD")
SMTP_USE_TLS = _env_bool("SMTP_USE_TLS", True)
SMTP_USE_SSL = _env_bool("SMTP_USE_SSL", False)
