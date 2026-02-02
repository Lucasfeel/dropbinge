import datetime

from psycopg2.extras import Json

from database import get_cursor
from services import tmdb_client
from services import tmdb_tracking_cache


def _parse_date(value):
    if not value:
        return None
    try:
        return datetime.date.fromisoformat(value)
    except ValueError:
        return None


def _season_dates(payload):
    episodes = payload.get("episodes") or []
    dates = [_parse_date(episode.get("air_date")) for episode in episodes]
    dates = [date for date in dates if date]
    last_episode_date = max(dates) if dates else None
    today = datetime.date.today()
    next_dates = [date for date in dates if date > today]
    next_episode_date = min(next_dates) if next_dates else None
    return last_episode_date, next_episode_date


def _tracking_key(target_type, follow):
    if target_type == "movie":
        return "movie", follow["tmdb_id"], -1
    if target_type == "tv_full":
        return "tv", follow["tmdb_id"], -1
    if target_type == "tv_season":
        return "season", follow["tmdb_id"], follow["season_number"]
    raise ValueError(f"Unknown target_type {target_type}")


def _extract_tracking_fields(target_type, payload):
    status_raw = payload.get("status")
    release_date = None
    first_air_date = None
    last_air_date = None
    next_air_date = None
    season_air_date = None
    season_last_episode_air_date = None
    season_count = None
    episode_count = None
    last_episode_date = None
    next_episode_date = None
    final_state = None
    final_completed_at = None

    if target_type == "movie":
        release_date = _parse_date(payload.get("release_date"))
        if status_raw == "Released":
            final_state = status_raw
            final_completed_at = release_date
    elif target_type == "tv_full":
        first_air_date = _parse_date(payload.get("first_air_date"))
        last_air_date = _parse_date(payload.get("last_air_date"))
        next_episode = payload.get("next_episode_to_air") or {}
        next_air_date = _parse_date(next_episode.get("air_date"))
        season_count = payload.get("number_of_seasons")
        episode_count = payload.get("number_of_episodes")
        last_episode_date = last_air_date
        next_episode_date = next_air_date
        if status_raw in ("Ended", "Canceled"):
            final_state = status_raw
            final_completed_at = last_air_date
    elif target_type == "tv_season":
        season_air_date = _parse_date(payload.get("air_date"))
        episodes = payload.get("episodes") or []
        episode_count = len(episodes) if episodes else None
        last_episode_date, next_episode_date = _season_dates(payload)
        season_last_episode_air_date = last_episode_date
        if last_episode_date and not next_episode_date:
            final_state = "binge_ready"
            final_completed_at = last_episode_date

    return {
        "status_raw": status_raw,
        "release_date": release_date,
        "first_air_date": first_air_date,
        "last_air_date": last_air_date,
        "next_air_date": next_air_date,
        "season_air_date": season_air_date,
        "season_last_episode_air_date": season_last_episode_air_date,
        "season_count": season_count,
        "episode_count": episode_count,
        "last_episode_date": last_episode_date,
        "next_episode_date": next_episode_date,
        "final_state": final_state,
        "final_completed_at": final_completed_at,
    }


def _fetch_existing_cache(conn, media_type, tmdb_id, season_number):
    cursor = get_cursor(conn)
    cursor.execute(
        """
        SELECT
            status_raw,
            release_date,
            first_air_date,
            last_air_date,
            next_air_date,
            season_air_date,
            season_last_episode_air_date
        FROM tmdb_cache
        WHERE media_type = %s AND tmdb_id = %s AND season_number = %s;
        """,
        (media_type, tmdb_id, season_number),
    )
    row = cursor.fetchone()
    cursor.close()
    return row


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


def refresh_follow(conn, follow, state, prefs, *, force_fetch=False, emit_events=True):
    target_type = follow["target_type"]
    media_type, tmdb_id, season_number = _tracking_key(target_type, follow)

    cached = None
    if not force_fetch:
        cached = tmdb_tracking_cache.get_tracking_cache(conn, media_type, tmdb_id, season_number)

    if cached:
        payload = cached["payload"]
        cache_fields = cached
        previous = cached
    else:
        if target_type == "movie":
            payload = tmdb_client.get_movie_details(tmdb_id)
        elif target_type == "tv_full":
            payload = tmdb_client.get_tv_details(tmdb_id)
        elif target_type == "tv_season":
            payload = tmdb_client.get_tv_season_details(tmdb_id, season_number)
        else:
            raise ValueError(f"Unknown target_type {target_type}")

        cache_fields = _extract_tracking_fields(target_type, payload)
        ttl_seconds = tmdb_tracking_cache.compute_tracking_ttl_seconds(
            media_type, payload, follow["target_type"]
        )
        previous = _fetch_existing_cache(conn, media_type, tmdb_id, season_number)
        tmdb_tracking_cache.upsert_tracking_cache(
            conn,
            media_type,
            tmdb_id,
            season_number,
            payload,
            cache_fields,
            ttl_seconds,
        )

    if not previous:
        if not cached:
            conn.commit()
        return []

    if not emit_events:
        if not cached:
            conn.commit()
        return []

    cursor = get_cursor(conn)
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
        new_release = cache_fields.get("release_date")
        if prev_release is None and new_release is not None:
            emit("date_set", {"from": None, "to": new_release.isoformat()})
        elif prev_release and new_release and prev_release != new_release:
            emit("date_changed", {"from": prev_release.isoformat(), "to": new_release.isoformat()})

        if prefs.get("notify_status_milestones"):
            prev_status = previous["status_raw"]
            new_status = cache_fields.get("status_raw")
            if prev_status != new_status and new_status:
                emit("status_milestone", {"from": prev_status, "to": new_status})

    if target_type == "tv_season":
        prev_air = previous["season_air_date"]
        new_air = cache_fields.get("season_air_date")
        if prev_air is None and new_air is not None:
            emit("date_set", {"from": None, "to": new_air.isoformat()})
        elif prev_air and new_air and prev_air != new_air:
            emit("date_changed", {"from": prev_air.isoformat(), "to": new_air.isoformat()})

        prev_last = previous["season_last_episode_air_date"]
        new_last = cache_fields.get("season_last_episode_air_date")
        prev_binge_ready = prev_last is not None and prev_last <= today
        new_binge_ready = new_last is not None and new_last <= today
        if new_binge_ready and not prev_binge_ready and prefs.get("notify_season_binge_ready"):
            emit("season_binge_ready", {"last_episode_air_date": new_last.isoformat()})

    if target_type == "tv_full":
        prev_status = previous["status_raw"]
        new_status = cache_fields.get("status_raw")
        prev_concluded = prev_status in ("Ended", "Canceled")
        new_concluded = new_status in ("Ended", "Canceled")
        if new_concluded and not prev_concluded and prefs.get("notify_full_run_concluded"):
            emit("full_run_concluded", {"from": prev_status, "to": new_status})

        prev_next = previous["next_air_date"]
        new_next = cache_fields.get("next_air_date")
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
