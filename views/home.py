import datetime

from flask import Blueprint, jsonify

from database import get_db, get_cursor
from utils.auth import require_auth

home_bp = Blueprint("home", __name__, url_prefix="/api/my")


@home_bp.get("/home")
@require_auth
def home_feed(payload):
    user_id = int(payload["sub"])
    db = get_db()
    cursor = get_cursor(db)
    cursor.execute(
        """
        SELECT
            f.id,
            f.target_type,
            f.tmdb_id,
            f.season_number,
            c.payload AS cache_payload,
            c.status_raw,
            c.release_date,
            c.first_air_date,
            c.last_air_date,
            c.next_air_date,
            c.season_air_date,
            c.season_last_episode_air_date,
            c.updated_at AS cache_updated_at
        FROM follows f
        LEFT JOIN tmdb_cache c ON (
            (f.target_type = 'movie' AND c.media_type = 'movie' AND c.tmdb_id = f.tmdb_id AND c.season_number = -1)
            OR (f.target_type = 'tv_full' AND c.media_type = 'tv' AND c.tmdb_id = f.tmdb_id AND c.season_number = -1)
            OR (f.target_type = 'tv_season' AND c.media_type = 'season' AND c.tmdb_id = f.tmdb_id AND c.season_number = f.season_number)
        )
        WHERE f.user_id = %s;
        """,
        (user_id,),
    )
    follows = cursor.fetchall()
    today = datetime.date.today()

    def _follow_date_info(follow):
        primary_date = None
        date_field = None
        if follow["target_type"] == "movie":
            primary_date = follow["release_date"]
            date_field = "release_date"
        elif follow["target_type"] == "tv_season":
            primary_date = follow["season_air_date"]
            date_field = "season_air_date"
        elif follow["target_type"] == "tv_full":
            primary_date = follow["next_air_date"]
            date_field = "next_air_date"

        is_concluded = follow["target_type"] == "tv_full" and follow["status_raw"] in ("Ended", "Canceled")
        has_cache = follow.get("cache_updated_at") is not None
        return primary_date, date_field, is_concluded, has_cache

    upcoming = []
    tbd_with_cache = []
    tbd_needs_refresh = []
    for follow in follows:
        primary_date, date_field, is_concluded, has_cache = _follow_date_info(follow)

        if primary_date:
            if primary_date >= today and not is_concluded:
                upcoming.append({**follow, "date": primary_date, "date_field": date_field})
        else:
            if not is_concluded:
                if has_cache:
                    tbd_with_cache.append(follow)
                else:
                    tbd_needs_refresh.append(follow)

    def _upcoming_sort_key(item):
        cache_updated_at = item.get("cache_updated_at")
        cache_missing = cache_updated_at is None
        cache_ts = cache_updated_at.timestamp() if cache_updated_at else 0
        return (item["date"], cache_missing, -cache_ts)

    upcoming.sort(key=_upcoming_sort_key)
    tbd_with_cache.sort(key=lambda item: item["cache_updated_at"], reverse=True)
    tbd_updates = tbd_with_cache + tbd_needs_refresh

    cursor.execute(
        """
        SELECT
            e.id,
            e.event_type,
            e.event_payload,
            e.created_at,
            f.id AS follow_id,
            f.target_type,
            f.tmdb_id,
            f.season_number,
            c.payload AS cache_payload
        FROM change_events e
        JOIN follows f ON f.id = e.follow_id
        LEFT JOIN tmdb_cache c ON (
            (f.target_type = 'movie' AND c.media_type = 'movie' AND c.tmdb_id = f.tmdb_id AND c.season_number = -1)
            OR (f.target_type = 'tv_full' AND c.media_type = 'tv' AND c.tmdb_id = f.tmdb_id AND c.season_number = -1)
            OR (f.target_type = 'tv_season' AND c.media_type = 'season' AND c.tmdb_id = f.tmdb_id AND c.season_number = f.season_number)
        )
        WHERE e.user_id = %s AND e.event_type IN ('season_binge_ready', 'full_run_concluded')
        ORDER BY e.created_at DESC
        LIMIT 20;
        """,
        (user_id,),
    )
    recent_completes = cursor.fetchall()
    summary_map = {
        "season_binge_ready": "Season binge-ready",
        "full_run_concluded": "Full run concluded",
    }
    for event in recent_completes:
        event["event_summary"] = summary_map.get(event["event_type"], event["event_type"])

    as_of = datetime.datetime.utcnow().isoformat() + "Z"
    tbd_needs_refresh_count = len(tbd_needs_refresh)
    meta = {
        "as_of": as_of,
        "counts": {
            "upcoming_drops": len(upcoming),
            "tbd_updates": len(tbd_updates),
            "recent_completes": len(recent_completes),
            "tbd_needs_refresh": tbd_needs_refresh_count,
        },
        "empty_messages": {
            "upcoming_drops": "No upcoming drops yet. Follow titles and refresh to see dates.",
            "tbd_updates": "No TBD titles right now.",
            "recent_completes": "No recent completes yet.",
        },
    }

    return jsonify(
        {
            "upcoming_drops": upcoming,
            "tbd_updates": tbd_updates,
            "recent_completes": recent_completes,
            "tbd_needs_refresh_count": tbd_needs_refresh_count,
            "meta": meta,
        }
    )
