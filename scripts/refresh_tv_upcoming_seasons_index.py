import argparse
import json
import os
import sys

from app import app
from database import get_db
from services import tv_upcoming_seasons_index


def _parse_languages(raw_languages):
    if raw_languages is None:
        raw_languages = os.getenv("TMDB_UPCOMING_LANGUAGES")
    if not raw_languages:
        return [None]
    return [entry.strip() or None for entry in raw_languages.split(",") if entry.strip()]


def _build_parser():
    parser = argparse.ArgumentParser(description="Refresh TMDB upcoming seasons index.")
    parser.add_argument("--full", action="store_true", help="Run a full rebuild.")
    parser.add_argument("--force", action="store_true", help="Force overwrite safeguards.")
    parser.add_argument(
        "--verify-min-items",
        type=int,
        default=0,
        help="Fail if results have fewer than N items (default: 0).",
    )
    parser.add_argument(
        "--languages",
        type=str,
        default=None,
        help="Comma-separated list of languages (overrides TMDB_UPCOMING_LANGUAGES).",
    )
    return parser


def main():
    parser = _build_parser()
    args = parser.parse_args()
    languages = _parse_languages(args.languages)
    failed = False
    with app.app_context():
        db = get_db()
        for language in languages:
            existing = tv_upcoming_seasons_index._load_index(db, language)
            existing_items = (existing or {}).get("items") or []
            stats = tv_upcoming_seasons_index.refresh_upcoming_seasons_index(
                db, language, full_rebuild=args.full, force=args.force
            )
            response, _ = tv_upcoming_seasons_index.get_upcoming_seasons_page(
                db, 1, language
            )
            result_count = len(response.get("results") or [])
            payload = {
                "language": language,
                "full_rebuild": args.full,
                "force": args.force,
                "verify_min_items": args.verify_min_items,
                "results": result_count,
                "existing_items": len(existing_items),
                "kept_existing": bool(stats.get("kept_existing")),
                "stats": stats,
            }
            print("tv_upcoming_bootstrap", json.dumps(payload, sort_keys=True), flush=True)
            if args.verify_min_items > 0 and result_count < args.verify_min_items:
                if not existing_items:
                    failed = True
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
