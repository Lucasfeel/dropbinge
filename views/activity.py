import datetime

from flask import Blueprint, jsonify

from database import get_db, get_cursor
from utils.auth import require_auth

activity_bp = Blueprint("activity", __name__, url_prefix="/api/my")

EVENT_SUMMARY_MAP = {
    "date_set": "Date set",
    "date_changed": "Date changed",
    "status_milestone": "Status milestone",
    "season_binge_ready": "Season binge-ready",
    "full_run_concluded": "Full run concluded",
}


def _title_from_cache(target_type, cache_payload):
    if not cache_payload:
        return None
    if target_type == "movie":
        return cache_payload.get("title")
    if target_type == "tv_full":
        return cache_payload.get("name")
    if target_type == "tv_season":
        name = cache_payload.get("name")
        if name:
            return name
        season_number = cache_payload.get("season_number")
        show_name = cache_payload.get("show_name") or cache_payload.get("show") or cache_payload.get("series_name")
        if show_name and season_number is not None:
            return f"{show_name} Season {season_number}"
        if season_number is not None:
            return f"Season {season_number}"
        return "TV Season"
    return None


def _event_summary(event_type):
    return EVENT_SUMMARY_MAP.get(event_type, event_type)


@activity_bp.get("/activity")
@require_auth
def activity(payload):
    user_id = int(payload["sub"])
    db = get_db()
    cursor = get_cursor(db)

    cursor.execute(
        """
        SELECT
            e.id,
            e.created_at,
            e.follow_id,
            e.event_type,
            e.event_payload,
            f.target_type,
            f.tmdb_id,
            f.season_number,
            c.payload AS cache_payload
        FROM change_events e
        LEFT JOIN follows f ON f.id = e.follow_id
        LEFT JOIN tmdb_cache c ON (
            (f.target_type = 'movie' AND c.media_type = 'movie' AND c.tmdb_id = f.tmdb_id AND c.season_number = -1)
            OR (f.target_type = 'tv_full' AND c.media_type = 'tv' AND c.tmdb_id = f.tmdb_id AND c.season_number = -1)
            OR (f.target_type = 'tv_season' AND c.media_type = 'season' AND c.tmdb_id = f.tmdb_id AND c.season_number = f.season_number)
        )
        WHERE e.user_id = %s
        ORDER BY e.created_at DESC
        LIMIT 50;
        """,
        (user_id,),
    )
    recent_events = []
    for row in cursor.fetchall():
        if not row.get("follow_id") or not row.get("target_type"):
            continue
        title = _title_from_cache(row["target_type"], row.get("cache_payload"))
        recent_events.append(
            {
                "id": row["id"],
                "created_at": row["created_at"],
                "follow_id": row["follow_id"],
                "target_type": row["target_type"],
                "tmdb_id": row["tmdb_id"],
                "season_number": row["season_number"],
                "title": title,
                "event_type": row["event_type"],
                "summary": _event_summary(row["event_type"]),
                "event_payload": row["event_payload"],
            }
        )

    cursor.execute(
        """
        SELECT
            o.id,
            o.created_at,
            o.sent_at,
            o.follow_id,
            o.channel,
            o.status,
            o.payload,
            f.target_type,
            f.tmdb_id,
            f.season_number,
            c.payload AS cache_payload
        FROM notification_outbox o
        LEFT JOIN follows f ON f.id = o.follow_id
        LEFT JOIN tmdb_cache c ON (
            (f.target_type = 'movie' AND c.media_type = 'movie' AND c.tmdb_id = f.tmdb_id AND c.season_number = -1)
            OR (f.target_type = 'tv_full' AND c.media_type = 'tv' AND c.tmdb_id = f.tmdb_id AND c.season_number = -1)
            OR (f.target_type = 'tv_season' AND c.media_type = 'season' AND c.tmdb_id = f.tmdb_id AND c.season_number = f.season_number)
        )
        WHERE o.user_id = %s
        ORDER BY o.created_at DESC
        LIMIT 50;
        """,
        (user_id,),
    )
    outbox = []
    for row in cursor.fetchall():
        if not row.get("follow_id") or not row.get("target_type"):
            continue
        title = _title_from_cache(row["target_type"], row.get("cache_payload"))
        payload_data = row.get("payload") or {}
        summary = payload_data.get("subject") or _event_summary(payload_data.get("event_type")) or "Notification queued"
        outbox.append(
            {
                "id": row["id"],
                "created_at": row["created_at"],
                "sent_at": row["sent_at"],
                "follow_id": row["follow_id"],
                "target_type": row["target_type"],
                "tmdb_id": row["tmdb_id"],
                "season_number": row["season_number"],
                "title": title,
                "channel": row["channel"],
                "status": row["status"],
                "summary": summary,
                "payload": payload_data,
            }
        )

    cursor.execute(
        """
        SELECT COUNT(*) AS count
        FROM notification_outbox
        WHERE user_id = %s AND status = 'pending';
        """,
        (user_id,),
    )
    pending_count = cursor.fetchone()["count"]

    as_of = datetime.datetime.utcnow().isoformat() + "Z"
    meta = {
        "as_of": as_of,
        "counts": {
            "recent_events": len(recent_events),
            "outbox": len(outbox),
            "outbox_pending": pending_count,
        },
    }

    return jsonify({"recent_events": recent_events, "outbox": outbox, "meta": meta})
