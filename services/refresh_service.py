import datetime

from psycopg2.extras import Json

from database import get_cursor
from services import tmdb_client


def _parse_date(value):
    if not value:
        return None
    try:
        return datetime.date.fromisoformat(value)
    except ValueError:
        return None


def _season_last_episode_air_date(payload):
    episodes = payload.get("episodes") or []
    dates = [_parse_date(episode.get("air_date")) for episode in episodes]
    dates = [date for date in dates if date]
    return max(dates) if dates else None


def _get_cache_key(follow):
    season_number = follow.get("season_number")
    return follow["target_type"], follow["tmdb_id"], season_number if season_number is not None else -1


def _extract_cache_fields(target_type, payload):
    status_raw = payload.get("status")
    release_date = None
    first_air_date = None
    last_air_date = None
    next_air_date = None
    season_air_date = None
    season_last_episode_air_date = None

    if target_type == "movie":
        release_date = _parse_date(payload.get("release_date"))
    elif target_type == "tv_full":
        first_air_date = _parse_date(payload.get("first_air_date"))
        last_air_date = _parse_date(payload.get("last_air_date"))
        next_episode = payload.get("next_episode_to_air") or {}
        next_air_date = _parse_date(next_episode.get("air_date"))
    elif target_type == "tv_season":
        season_air_date = _parse_date(payload.get("air_date"))
        season_last_episode_air_date = _season_last_episode_air_date(payload)

    return {
        "status_raw": status_raw,
        "release_date": release_date,
        "first_air_date": first_air_date,
        "last_air_date": last_air_date,
        "next_air_date": next_air_date,
        "season_air_date": season_air_date,
        "season_last_episode_air_date": season_last_episode_air_date,
    }


def _insert_event(cursor, user_id, follow_id, event_type, payload):
    cursor.execute(
        """
        INSERT INTO change_events (user_id, follow_id, event_type, event_payload)
        VALUES (%s, %s, %s, %s)
        RETURNING id;
        """,
        (user_id, follow_id, event_type, Json(payload)),
    )
    return cursor.fetchone()["id"]


def _enqueue_notifications(cursor, user_id, follow_id, event_type, payload, prefs):
    channels = []
    if prefs.get("channel_email"):
        channels.append("email")
    if prefs.get("channel_whatsapp"):
        channels.append("whatsapp")
    for channel in channels:
        cursor.execute(
            """
            INSERT INTO notification_outbox (user_id, follow_id, channel, payload)
            VALUES (%s, %s, %s, %s);
            """,
            (user_id, follow_id, channel, Json({"event_type": event_type, **payload})),
        )


def refresh_follow(conn, follow, prefs):
    target_type = follow["target_type"]
    if target_type == "movie":
        payload = tmdb_client.get_movie_details(follow["tmdb_id"])
        media_type = "movie"
        season_number = -1
    elif target_type == "tv_full":
        payload = tmdb_client.get_tv_details(follow["tmdb_id"])
        media_type = "tv"
        season_number = -1
    elif target_type == "tv_season":
        payload = tmdb_client.get_tv_season_details(follow["tmdb_id"], follow["season_number"])
        media_type = "season"
        season_number = follow["season_number"]
    else:
        raise ValueError(f"Unknown target_type {target_type}")

    cache_fields = _extract_cache_fields(target_type, payload)

    cursor = get_cursor(conn)
    cursor.execute(
        """
        SELECT * FROM tmdb_cache
        WHERE media_type = %s AND tmdb_id = %s AND season_number = %s;
        """,
        (media_type, follow["tmdb_id"], season_number),
    )
    previous = cursor.fetchone()

    cursor.execute(
        """
        INSERT INTO tmdb_cache (
            media_type, tmdb_id, season_number, payload, status_raw, release_date,
            first_air_date, last_air_date, next_air_date, season_air_date,
            season_last_episode_air_date, updated_at
        ) VALUES (
            %s, %s, %s, %s, %s, %s,
            %s, %s, %s, %s,
            %s, NOW()
        )
        ON CONFLICT (media_type, tmdb_id, season_number)
        DO UPDATE SET
            payload = EXCLUDED.payload,
            status_raw = EXCLUDED.status_raw,
            release_date = EXCLUDED.release_date,
            first_air_date = EXCLUDED.first_air_date,
            last_air_date = EXCLUDED.last_air_date,
            next_air_date = EXCLUDED.next_air_date,
            season_air_date = EXCLUDED.season_air_date,
            season_last_episode_air_date = EXCLUDED.season_last_episode_air_date,
            updated_at = NOW();
        """,
        (
            media_type,
            follow["tmdb_id"],
            season_number,
            Json(payload),
            cache_fields["status_raw"],
            cache_fields["release_date"],
            cache_fields["first_air_date"],
            cache_fields["last_air_date"],
            cache_fields["next_air_date"],
            cache_fields["season_air_date"],
            cache_fields["season_last_episode_air_date"],
        ),
    )

    if not previous:
        conn.commit()
        cursor.close()
        return []

    events = []
    today = datetime.date.today()

    date_event_types = {"date_set", "date_changed"}

    def emit(event_type, payload):
        if event_type in date_event_types and not prefs.get("notify_date_changes", True):
            return
        _insert_event(cursor, follow["user_id"], follow["id"], event_type, payload)
        _enqueue_notifications(cursor, follow["user_id"], follow["id"], event_type, payload, prefs)
        events.append(event_type)

    if target_type == "movie":
        prev_release = previous["release_date"]
        new_release = cache_fields["release_date"]
        if prev_release is None and new_release is not None:
            emit("date_set", {"from": None, "to": new_release.isoformat()})
        elif prev_release and new_release and prev_release != new_release:
            emit("date_changed", {"from": prev_release.isoformat(), "to": new_release.isoformat()})

        if prefs.get("notify_status_milestones"):
            prev_status = previous["status_raw"]
            new_status = cache_fields["status_raw"]
            if prev_status != new_status and new_status:
                emit("status_milestone", {"from": prev_status, "to": new_status})

    if target_type == "tv_season":
        prev_air = previous["season_air_date"]
        new_air = cache_fields["season_air_date"]
        if prev_air is None and new_air is not None:
            emit("date_set", {"from": None, "to": new_air.isoformat()})
        elif prev_air and new_air and prev_air != new_air:
            emit("date_changed", {"from": prev_air.isoformat(), "to": new_air.isoformat()})

        prev_last = previous["season_last_episode_air_date"]
        new_last = cache_fields["season_last_episode_air_date"]
        prev_binge_ready = prev_last is not None and prev_last <= today
        new_binge_ready = new_last is not None and new_last <= today
        if new_binge_ready and not prev_binge_ready and prefs.get("notify_season_binge_ready"):
            emit("season_binge_ready", {"last_episode_air_date": new_last.isoformat()})

    if target_type == "tv_full":
        prev_status = previous["status_raw"]
        new_status = cache_fields["status_raw"]
        prev_concluded = prev_status in ("Ended", "Canceled")
        new_concluded = new_status in ("Ended", "Canceled")
        if new_concluded and not prev_concluded and prefs.get("notify_full_run_concluded"):
            emit("full_run_concluded", {"from": prev_status, "to": new_status})

        prev_next = previous["next_air_date"]
        new_next = cache_fields["next_air_date"]
        if prev_next is None and new_next is not None:
            emit("date_set", {"from": None, "to": new_next.isoformat(), "field": "next_air_date"})
        elif prev_next and new_next and prev_next != new_next:
            emit(
                "date_changed",
                {"from": prev_next.isoformat(), "to": new_next.isoformat(), "field": "next_air_date"},
            )

    conn.commit()
    cursor.close()
    return events
