import datetime

from psycopg2.extras import Json

from database import get_cursor


def _parse_date(value):
    if not value:
        return None
    try:
        return datetime.date.fromisoformat(value)
    except ValueError:
        return None


def _season_dates(payload):
    episodes = payload.get("episodes") or []
    dates = []
    for episode in episodes:
        date_value = _parse_date(episode.get("air_date"))
        if date_value:
            dates.append(date_value)
    last_episode_date = max(dates) if dates else None
    today = datetime.date.today()
    future_dates = [date for date in dates if date > today]
    next_episode_date = min(future_dates) if future_dates else None
    return last_episode_date, next_episode_date


def get_tracking_cache(conn, media_type, tmdb_id, season_number):
    cursor = get_cursor(conn)
    cursor.execute(
        """
        SELECT
            payload,
            fetched_at,
            expires_at,
            status_raw,
            release_date,
            first_air_date,
            last_air_date,
            next_air_date,
            season_air_date,
            season_last_episode_air_date,
            season_count,
            episode_count,
            last_episode_date,
            next_episode_date,
            final_state,
            final_completed_at
        FROM tmdb_cache
        WHERE media_type = %s AND tmdb_id = %s AND season_number = %s;
        """,
        (media_type, tmdb_id, season_number),
    )
    row = cursor.fetchone()
    cursor.close()
    if not row:
        return None
    expires_at = row.get("expires_at")
    if not expires_at or expires_at <= datetime.datetime.utcnow():
        return None
    return row


def compute_tracking_ttl_seconds(media_type, payload, follow_target_type):
    status = payload.get("status")
    release_date = _parse_date(payload.get("release_date"))
    next_episode = payload.get("next_episode_to_air") or {}
    next_episode_date = _parse_date(next_episode.get("air_date"))
    final_movie_statuses = {"Released"}
    final_tv_statuses = {"Ended", "Canceled"}
    movie_short_statuses = {"Rumored", "Planned", "In Production", "Post Production"}

    if media_type == "movie" or follow_target_type == "movie":
        if status in final_movie_statuses:
            return 7 * 24 * 60 * 60
        if release_date is None or status in movie_short_statuses or not status:
            return 6 * 60 * 60
        return 24 * 60 * 60

    if media_type == "tv" or follow_target_type == "tv_full":
        if status in final_tv_statuses:
            return 7 * 24 * 60 * 60
        if next_episode_date or status not in final_tv_statuses:
            return 6 * 60 * 60
        return 24 * 60 * 60

    if media_type == "season" or follow_target_type == "tv_season":
        last_episode_date, next_episode_date = _season_dates(payload)
        if last_episode_date and not next_episode_date:
            return 7 * 24 * 60 * 60
        return 6 * 60 * 60

    return 6 * 60 * 60


def upsert_tracking_cache(
    conn,
    media_type,
    tmdb_id,
    season_number,
    payload,
    extracted_fields,
    ttl_seconds,
):
    expires_at = datetime.datetime.utcnow() + datetime.timedelta(seconds=ttl_seconds)
    cursor = get_cursor(conn)
    cursor.execute(
        """
        INSERT INTO tmdb_cache (
            media_type,
            tmdb_id,
            season_number,
            payload,
            status_raw,
            release_date,
            first_air_date,
            last_air_date,
            next_air_date,
            season_air_date,
            season_last_episode_air_date,
            season_count,
            episode_count,
            last_episode_date,
            next_episode_date,
            final_state,
            final_completed_at,
            fetched_at,
            expires_at,
            updated_at
        ) VALUES (
            %s, %s, %s, %s, %s, %s,
            %s, %s, %s, %s, %s,
            %s, %s, %s, %s, %s, %s,
            NOW(), %s, NOW()
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
            season_count = EXCLUDED.season_count,
            episode_count = EXCLUDED.episode_count,
            last_episode_date = EXCLUDED.last_episode_date,
            next_episode_date = EXCLUDED.next_episode_date,
            final_state = EXCLUDED.final_state,
            final_completed_at = EXCLUDED.final_completed_at,
            fetched_at = EXCLUDED.fetched_at,
            expires_at = EXCLUDED.expires_at,
            updated_at = NOW();
        """,
        (
            media_type,
            tmdb_id,
            season_number,
            Json(payload),
            extracted_fields.get("status_raw"),
            extracted_fields.get("release_date"),
            extracted_fields.get("first_air_date"),
            extracted_fields.get("last_air_date"),
            extracted_fields.get("next_air_date"),
            extracted_fields.get("season_air_date"),
            extracted_fields.get("season_last_episode_air_date"),
            extracted_fields.get("season_count"),
            extracted_fields.get("episode_count"),
            extracted_fields.get("last_episode_date"),
            extracted_fields.get("next_episode_date"),
            extracted_fields.get("final_state"),
            extracted_fields.get("final_completed_at"),
            expires_at,
        ),
    )
    cursor.close()
