import os
import sys

from app import app
from services import tv_upcoming_seasons_index


def _parse_languages():
    raw = os.getenv("TMDB_UPCOMING_LANGUAGES")
    if not raw:
        return [None]
    return [entry.strip() or None for entry in raw.split(",") if entry.strip()]


def main():
    languages = _parse_languages()
    failed = False
    with app.app_context():
        for language in languages:
            existing = tv_upcoming_seasons_index._load_index(None, language)
            stats = tv_upcoming_seasons_index.refresh_upcoming_seasons_index(
                None, language, full_rebuild=False
            )
            if not stats.get("ok"):
                if existing is None:
                    failed = True
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
