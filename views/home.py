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

    upcoming = []
    tbd = []
    for follow in follows:
        date_value = None
        if follow["target_type"] == "movie":
            date_value = follow["release_date"]
        elif follow["target_type"] == "tv_season":
            date_value = follow["season_air_date"]
        elif follow["target_type"] == "tv_full":
            date_value = follow["next_air_date"]

        if date_value:
            if date_value >= today:
                upcoming.append({**follow, "date": date_value})
        else:
            tbd.append(follow)

    upcoming.sort(key=lambda item: item["date"])
    tbd.sort(key=lambda item: item.get("cache_updated_at") or datetime.datetime.min, reverse=True)

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

    return jsonify(
        {
            "upcoming_drops": upcoming,
            "tbd_updates": tbd,
            "recent_completes": recent_completes,
        }
    )
