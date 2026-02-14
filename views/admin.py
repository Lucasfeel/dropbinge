import time
from datetime import date, datetime, timedelta

from flask import Blueprint, jsonify, request
from psycopg2.extras import Json

import config
from database import get_cursor, get_db
from services.email_provider import build_email_provider_from_config
from services.admin_report_service import (
    build_daily_notification_text,
    build_daily_summary,
    expand_status_filter,
    normalize_report_status,
    parse_report_data,
)
from services.outbox_dispatcher import dispatch_email_outbox_once
from services.refresh_all_service import refresh_all_follows
from services.refresh_service import refresh_follow
from utils.auth import is_admin_email, require_admin

admin_bp = Blueprint("admin", __name__, url_prefix="/api/admin")

_CACHE_JOIN_SQL = """
    LEFT JOIN tmdb_cache c ON (
        (f.target_type = 'movie' AND c.media_type = 'movie' AND c.tmdb_id = f.tmdb_id AND c.season_number = -1)
        OR (f.target_type = 'tv_full' AND c.media_type = 'tv' AND c.tmdb_id = f.tmdb_id AND c.season_number = -1)
        OR (f.target_type = 'tv_season' AND c.media_type = 'season' AND c.tmdb_id = f.tmdb_id AND c.season_number = f.season_number)
    )
"""


def _bounded_int(raw_value, default, minimum=0, maximum=200):
    try:
        value = int(raw_value)
    except (TypeError, ValueError):
        return default
    if value < minimum:
        return minimum
    if value > maximum:
        return maximum
    return value


def _optional_positive_int(raw_value):
    if raw_value is None or raw_value == "":
        return None
    try:
        value = int(raw_value)
    except (TypeError, ValueError):
        return None
    if value <= 0:
        return None
    return value


def _title_from_cache(target_type, cache_payload):
    if not cache_payload:
        return None
    if target_type == "movie":
        return cache_payload.get("title")
    if target_type == "tv_full":
        return cache_payload.get("name")
    if target_type == "tv_season":
        season_name = cache_payload.get("name")
        if season_name:
            return season_name
        season_number = cache_payload.get("season_number")
        series_name = cache_payload.get("show_name") or cache_payload.get("series_name")
        if series_name and season_number is not None:
            return f"{series_name} Season {season_number}"
        if season_number is not None:
            return f"Season {season_number}"
        return "TV Season"
    return None


def _apply_user_search_clause(q):
    q = (q or "").strip()
    if not q:
        return "", []
    return (
        "WHERE u.email ILIKE %s OR CAST(u.id AS TEXT) = %s",
        [f"%{q}%", q],
    )


def _parse_datetime_param(raw_value):
    if raw_value is None or raw_value == "":
        return None
    try:
        parsed = datetime.fromisoformat(str(raw_value).replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is not None:
        return parsed.astimezone().replace(tzinfo=None)
    return parsed


def _parse_date_param(raw_value):
    if raw_value is None or raw_value == "":
        return None
    try:
        return date.fromisoformat(str(raw_value))
    except ValueError:
        return None


def _parse_bool_param(raw_value, default=False):
    if raw_value is None:
        return default
    value = str(raw_value).strip().lower()
    if value in ("1", "true", "yes", "on"):
        return True
    if value in ("0", "false", "no", "off"):
        return False
    return default


def _serialize_admin_job_report(row):
    report_data = parse_report_data(row.get("report_data"))
    created_at = row.get("created_at")
    return {
        "id": row.get("id"),
        "crawler_name": row.get("job_name"),
        "status": row.get("status"),
        "normalized_status": normalize_report_status(row.get("status")),
        "report_data": report_data,
        "created_at": created_at.isoformat() if created_at else None,
    }


def _record_admin_job_report(conn, job_name, status, report_data):
    cursor = get_cursor(conn)
    try:
        cursor.execute(
            """
            INSERT INTO admin_job_reports (job_name, status, report_data)
            VALUES (%s, %s, %s);
            """,
            (job_name, status, Json(report_data or {})),
        )
    finally:
        cursor.close()


_ALLOWED_MEDIA_TYPES = {"movie", "tv", "season"}
_ALLOWED_MEDIA_TYPES_LIST = ["movie", "tv", "season"]
_ALLOWED_CONTENT_ACTION_TYPES = {
    "OVERRIDE_UPSERT",
    "OVERRIDE_DELETE",
}

_ADMIN_CONTENT_SELECT_SQL = """
    WITH targets AS (
        SELECT DISTINCT
            target.media_type,
            target.tmdb_id,
            target.season_number
        FROM (
            SELECT
                c.media_type,
                c.tmdb_id,
                c.season_number
            FROM tmdb_cache c
            WHERE c.media_type IN ('movie', 'tv', 'season')

            UNION

            SELECT
                CASE
                    WHEN c.media_type = 'http:movie_detail' THEN 'movie'
                    WHEN c.media_type = 'http:tv_detail' THEN 'tv'
                    WHEN c.media_type = 'http:tv_season_detail' THEN 'season'
                    ELSE NULL
                END AS media_type,
                c.tmdb_id,
                CASE
                    WHEN c.media_type = 'http:tv_season_detail' THEN c.season_number
                    ELSE -1
                END AS season_number
            FROM tmdb_cache c
            WHERE c.media_type IN ('http:movie_detail', 'http:tv_detail', 'http:tv_season_detail')

            UNION

            SELECT
                CASE
                    WHEN f.target_type = 'movie' THEN 'movie'
                    WHEN f.target_type = 'tv_full' THEN 'tv'
                    WHEN f.target_type = 'tv_season' THEN 'season'
                    ELSE NULL
                END AS media_type,
                f.tmdb_id,
                CASE
                    WHEN f.target_type = 'tv_season' THEN COALESCE(f.season_number, -1)
                    ELSE -1
                END AS season_number
            FROM follows f
        ) target
        WHERE target.media_type IS NOT NULL
    )
    SELECT
        t.media_type,
        t.tmdb_id,
        t.season_number,
        c.status_raw,
        c.release_date,
        c.first_air_date,
        c.last_air_date,
        c.next_air_date,
        c.season_air_date,
        c.season_last_episode_air_date,
        c.season_count,
        c.episode_count,
        c.last_episode_date,
        c.next_episode_date,
        c.final_state,
        c.final_completed_at,
        COALESCE(c.payload, d.payload) AS payload,
        COALESCE(pt.payload, ptd.payload) AS parent_tv_payload,
        COALESCE(c.fetched_at, d.fetched_at) AS fetched_at,
        COALESCE(c.expires_at, d.expires_at) AS expires_at,
        COALESCE(c.updated_at, d.updated_at) AS updated_at,
        o.id AS override_id,
        o.override_status_raw,
        o.override_release_date,
        o.override_next_air_date,
        o.override_final_state,
        o.override_final_completed_at,
        o.reason AS override_reason,
        o.admin_email AS override_admin_email,
        o.created_at AS override_created_at,
        o.updated_at AS override_updated_at
    FROM targets t
    LEFT JOIN tmdb_cache c
      ON c.media_type = t.media_type
     AND c.tmdb_id = t.tmdb_id
     AND c.season_number = t.season_number
    LEFT JOIN tmdb_cache d
      ON (
          (t.media_type = 'movie' AND d.media_type = 'http:movie_detail' AND d.tmdb_id = t.tmdb_id AND d.season_number = -1)
          OR (t.media_type = 'tv' AND d.media_type = 'http:tv_detail' AND d.tmdb_id = t.tmdb_id AND d.season_number = -1)
          OR (t.media_type = 'season' AND d.media_type = 'http:tv_season_detail' AND d.tmdb_id = t.tmdb_id AND d.season_number = t.season_number)
      )
    LEFT JOIN admin_tmdb_overrides o
      ON o.media_type = t.media_type
     AND o.tmdb_id = t.tmdb_id
     AND o.season_number = t.season_number
    LEFT JOIN tmdb_cache pt
      ON t.media_type = 'season'
      AND pt.media_type = 'tv'
     AND pt.tmdb_id = t.tmdb_id
     AND pt.season_number = -1
    LEFT JOIN tmdb_cache ptd
      ON t.media_type = 'season'
     AND ptd.media_type = 'http:tv_detail'
     AND ptd.tmdb_id = t.tmdb_id
     AND ptd.season_number = -1
"""


def _normalize_media_type(raw_value):
    normalized = (raw_value or "").strip().lower()
    if normalized in _ALLOWED_MEDIA_TYPES:
        return normalized
    return None


def _parse_tmdb_id(raw_value):
    try:
        parsed = int(raw_value)
    except (TypeError, ValueError):
        return None
    if parsed <= 0:
        return None
    return parsed


def _resolve_season_number(media_type, raw_value):
    if media_type == "season":
        try:
            season_number = int(raw_value)
        except (TypeError, ValueError):
            return None
        if season_number < 0:
            return None
        return season_number

    if raw_value is None or raw_value == "":
        return -1
    try:
        season_number = int(raw_value)
    except (TypeError, ValueError):
        return None
    if season_number != -1:
        return None
    return season_number


def _iso(value):
    if value is None:
        return None
    if hasattr(value, "isoformat"):
        return value.isoformat()
    return value


def _as_json_object(value):
    if value is None:
        return {}
    if isinstance(value, dict):
        return value
    if isinstance(value, str):
        try:
            parsed = parse_report_data(value)
            return parsed if isinstance(parsed, dict) else {}
        except Exception:
            return {}
    return {}


def _content_title_from_cache_row(media_type, tmdb_id, season_number, payload, parent_tv_payload=None):
    payload_data = _as_json_object(payload)
    parent_tv_payload_data = _as_json_object(parent_tv_payload)
    if media_type == "movie":
        return (
            payload_data.get("title")
            or payload_data.get("original_title")
            or payload_data.get("name")
            or payload_data.get("original_name")
            or f"TMDB Movie {tmdb_id}"
        )
    if media_type == "tv":
        return (
            payload_data.get("name")
            or payload_data.get("original_name")
            or payload_data.get("title")
            or payload_data.get("original_title")
            or f"TMDB TV {tmdb_id}"
        )
    if media_type == "season":
        season_name = payload_data.get("name")
        show_name = (
            payload_data.get("show_name")
            or payload_data.get("series_name")
            or parent_tv_payload_data.get("name")
            or parent_tv_payload_data.get("original_name")
            or parent_tv_payload_data.get("title")
            or parent_tv_payload_data.get("original_title")
        )
        if season_name and show_name:
            if season_name.lower().startswith(show_name.lower()):
                return season_name
            return f"{show_name} {season_name}"
        if season_name:
            return season_name
        if show_name and season_number is not None:
            return f"{show_name} Season {season_number}"
        if season_number is not None:
            return f"Season {season_number}"
        return f"TMDB Season {tmdb_id}"
    return f"TMDB {tmdb_id}"


def _serialize_tmdb_override(row):
    if not row or row.get("override_id") is None:
        return None
    return {
        "id": row.get("override_id"),
        "status_raw": row.get("override_status_raw"),
        "release_date": _iso(row.get("override_release_date")),
        "next_air_date": _iso(row.get("override_next_air_date")),
        "final_state": row.get("override_final_state"),
        "final_completed_at": _iso(row.get("override_final_completed_at")),
        "reason": row.get("override_reason"),
        "admin_email": row.get("override_admin_email"),
        "created_at": _iso(row.get("override_created_at")),
        "updated_at": _iso(row.get("override_updated_at")),
    }


def _serialize_admin_content(row):
    payload = _as_json_object(row.get("payload"))
    media_type = row.get("media_type")
    tmdb_id = row.get("tmdb_id")
    season_number = row.get("season_number")

    base = {
        "status_raw": row.get("status_raw"),
        "release_date": _iso(row.get("release_date")),
        "first_air_date": _iso(row.get("first_air_date")),
        "last_air_date": _iso(row.get("last_air_date")),
        "next_air_date": _iso(row.get("next_air_date")),
        "season_air_date": _iso(row.get("season_air_date")),
        "season_last_episode_air_date": _iso(row.get("season_last_episode_air_date")),
        "season_count": row.get("season_count"),
        "episode_count": row.get("episode_count"),
        "last_episode_date": _iso(row.get("last_episode_date")),
        "next_episode_date": _iso(row.get("next_episode_date")),
        "final_state": row.get("final_state"),
        "final_completed_at": _iso(row.get("final_completed_at")),
    }
    override = _serialize_tmdb_override(row)
    effective = {
        "status_raw": (override or {}).get("status_raw") or base["status_raw"],
        "release_date": (override or {}).get("release_date") or base["release_date"],
        "next_air_date": (override or {}).get("next_air_date") or base["next_air_date"],
        "final_state": (override or {}).get("final_state") or base["final_state"],
        "final_completed_at": (override or {}).get("final_completed_at")
        or base["final_completed_at"],
    }
    effective["missing_final_completed_at"] = bool(
        effective["final_state"] and not effective["final_completed_at"]
    )

    return {
        "key": f"{media_type}:{tmdb_id}:{season_number}",
        "media_type": media_type,
        "tmdb_id": tmdb_id,
        "season_number": season_number,
        "title": _content_title_from_cache_row(
            media_type,
            tmdb_id,
            season_number,
            payload,
            row.get("parent_tv_payload"),
        ),
        "poster_path": payload.get("poster_path"),
        "backdrop_path": payload.get("backdrop_path"),
        "base": base,
        "override": override,
        "effective": effective,
        "payload": payload,
        "fetched_at": _iso(row.get("fetched_at")),
        "expires_at": _iso(row.get("expires_at")),
        "updated_at": _iso(row.get("updated_at")),
    }


def _record_content_action_log(
    conn,
    *,
    action_type,
    media_type,
    tmdb_id,
    season_number,
    reason=None,
    admin_email=None,
    payload_data=None,
):
    cursor = get_cursor(conn)
    try:
        cursor.execute(
            """
            INSERT INTO admin_content_action_logs (
                action_type,
                media_type,
                tmdb_id,
                season_number,
                reason,
                admin_email,
                payload
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s);
            """,
            (
                action_type,
                media_type,
                tmdb_id,
                season_number,
                reason,
                admin_email,
                Json(payload_data or {}),
            ),
        )
    finally:
        cursor.close()


def _fetch_admin_content_row(conn, media_type, tmdb_id, season_number):
    cursor = get_cursor(conn)
    try:
        cursor.execute(
            f"""
            {_ADMIN_CONTENT_SELECT_SQL}
            WHERE t.media_type = %s
              AND t.tmdb_id = %s
              AND t.season_number = %s
            LIMIT 1;
            """,
            (media_type, tmdb_id, season_number),
        )
        return cursor.fetchone()
    finally:
        cursor.close()


def _resolve_optional_text(body, key, existing_value):
    if key not in body:
        return existing_value
    raw_value = body.get(key)
    if raw_value is None:
        return None
    value = str(raw_value).strip()
    return value or None


def _resolve_optional_date(body, key, existing_value):
    if key not in body:
        return existing_value, None
    raw_value = body.get(key)
    if raw_value in (None, ""):
        return None, None
    parsed = _parse_date_param(raw_value)
    if parsed is None:
        return existing_value, f"{key} must be YYYY-MM-DD"
    return parsed, None


@admin_bp.get("/overview")
@require_admin
def admin_overview(payload):
    db = get_db()
    cursor = get_cursor(db)

    cursor.execute("SELECT COUNT(*) AS count FROM users;")
    users_total = cursor.fetchone()["count"]

    cursor.execute("SELECT COUNT(*) AS count FROM follows;")
    follows_total = cursor.fetchone()["count"]

    cursor.execute(
        """
        SELECT target_type, COUNT(*) AS count
        FROM follows
        GROUP BY target_type
        ORDER BY target_type ASC;
        """
    )
    follow_breakdown = {row["target_type"]: row["count"] for row in cursor.fetchall()}

    cursor.execute(
        """
        SELECT status, COUNT(*) AS count
        FROM notification_outbox
        GROUP BY status
        ORDER BY status ASC;
        """
    )
    outbox_status = {row["status"]: row["count"] for row in cursor.fetchall()}

    cursor.execute(
        """
        SELECT COUNT(*) AS count
        FROM change_events
        WHERE created_at >= NOW() - INTERVAL '24 hours';
        """
    )
    change_events_24h = cursor.fetchone()["count"]

    cursor.execute(
        """
        SELECT COUNT(*) AS count
        FROM notification_outbox
        WHERE created_at >= NOW() - INTERVAL '24 hours';
        """
    )
    outbox_24h = cursor.fetchone()["count"]

    cursor.execute(
        """
        SELECT
            u.id,
            u.email,
            COUNT(f.id) AS follows_count
        FROM users u
        LEFT JOIN follows f ON f.user_id = u.id
        GROUP BY u.id, u.email
        ORDER BY follows_count DESC, u.id ASC
        LIMIT 5;
        """
    )
    top_users = cursor.fetchall()

    cursor.execute("SELECT MAX(created_at) AS latest_user_created_at FROM users;")
    latest_user_created_at = cursor.fetchone()["latest_user_created_at"]

    cursor.execute("SELECT MAX(created_at) AS latest_follow_created_at FROM follows;")
    latest_follow_created_at = cursor.fetchone()["latest_follow_created_at"]

    cursor.execute(
        "SELECT MIN(created_at) AS oldest_pending_created_at FROM notification_outbox WHERE status = 'pending';"
    )
    oldest_pending_created_at = cursor.fetchone()["oldest_pending_created_at"]

    return jsonify(
        {
            "admin_email": payload.get("email"),
            "admin_restricted": bool(config.ADMIN_EMAILS),
            "users_total": users_total,
            "follows_total": follows_total,
            "follow_breakdown": follow_breakdown,
            "outbox_status": outbox_status,
            "change_events_24h": change_events_24h,
            "outbox_24h": outbox_24h,
            "oldest_pending_created_at": oldest_pending_created_at,
            "latest_user_created_at": latest_user_created_at,
            "latest_follow_created_at": latest_follow_created_at,
            "top_users": top_users,
        }
    )


@admin_bp.get("/users")
@require_admin
def admin_users(payload):
    _ = payload
    q = (request.args.get("q") or "").strip()
    limit = _bounded_int(request.args.get("limit"), default=20, minimum=1, maximum=100)
    offset = _bounded_int(request.args.get("offset"), default=0, minimum=0, maximum=100000)

    where_sql, where_params = _apply_user_search_clause(q)

    db = get_db()
    cursor = get_cursor(db)
    cursor.execute(f"SELECT COUNT(*) AS count FROM users u {where_sql};", tuple(where_params))
    total = cursor.fetchone()["count"]

    cursor.execute(
        f"""
        SELECT
            u.id,
            u.email,
            u.created_at,
            (
                SELECT COUNT(*)
                FROM follows f
                WHERE f.user_id = u.id
            ) AS follows_count,
            (
                SELECT COUNT(*)
                FROM notification_outbox o
                WHERE o.user_id = u.id AND o.status = 'pending'
            ) AS pending_outbox_count,
            (
                SELECT MAX(f.created_at)
                FROM follows f
                WHERE f.user_id = u.id
            ) AS last_followed_at,
            (
                SELECT MAX(e.created_at)
                FROM change_events e
                WHERE e.user_id = u.id
            ) AS last_event_at
        FROM users u
        {where_sql}
        ORDER BY u.created_at DESC
        LIMIT %s OFFSET %s;
        """,
        tuple(where_params + [limit, offset]),
    )
    users = cursor.fetchall()
    for user in users:
        user["is_admin"] = is_admin_email(user.get("email"))

    return jsonify(
        {
            "users": users,
            "q": q,
            "limit": limit,
            "offset": offset,
            "total": total,
        }
    )


@admin_bp.get("/users/<int:user_id>/follows")
@require_admin
def admin_user_follows(payload, user_id):
    _ = payload
    db = get_db()
    cursor = get_cursor(db)

    cursor.execute(
        """
        SELECT id, email, created_at
        FROM users
        WHERE id = %s;
        """,
        (user_id,),
    )
    user = cursor.fetchone()
    if not user:
        return jsonify({"error": "User not found"}), 404
    user["is_admin"] = is_admin_email(user["email"])

    cursor.execute(
        f"""
        SELECT
            f.id,
            f.user_id,
            f.target_type,
            f.tmdb_id,
            f.season_number,
            f.created_at,
            p.notify_date_changes,
            p.notify_status_milestones,
            p.notify_season_binge_ready,
            p.notify_episode_drops,
            p.notify_full_run_concluded,
            p.channel_email,
            p.channel_whatsapp,
            p.frequency,
            p.updated_at AS prefs_updated_at,
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
        JOIN follow_prefs p ON p.follow_id = f.id
        {_CACHE_JOIN_SQL}
        WHERE f.user_id = %s
        ORDER BY f.created_at DESC;
        """,
        (user_id,),
    )
    follows = cursor.fetchall()
    cursor.close()
    for follow in follows:
        follow["title"] = _title_from_cache(follow["target_type"], follow.get("cache_payload"))

    return jsonify({"user": user, "follows": follows})


@admin_bp.delete("/follows/<int:follow_id>")
@require_admin
def admin_delete_follow(payload, follow_id):
    _ = payload
    db = get_db()
    cursor = get_cursor(db)
    cursor.execute(
        """
        DELETE FROM follows
        WHERE id = %s
        RETURNING id, user_id, target_type, tmdb_id, season_number;
        """,
        (follow_id,),
    )
    deleted = cursor.fetchone()
    if not deleted:
        return jsonify({"error": "Follow not found"}), 404
    db.commit()
    return jsonify({"deleted": deleted})


@admin_bp.get("/contents/search")
@require_admin
def admin_contents_search(payload):
    _ = payload
    limit = _bounded_int(request.args.get("limit"), default=50, minimum=1, maximum=200)
    offset = _bounded_int(request.args.get("offset"), default=0, minimum=0, maximum=100000)

    q = (request.args.get("q") or "").strip()
    media_type_raw = (request.args.get("media_type") or "").strip()
    final_state = (request.args.get("final_state") or "").strip()
    has_override_raw = request.args.get("has_override")
    missing_final_date = _parse_bool_param(request.args.get("missing_final_date"), default=False)

    media_type = None
    if media_type_raw and media_type_raw.lower() != "all":
        media_type = _normalize_media_type(media_type_raw)
        if media_type is None:
            return jsonify({"error": "media_type must be movie, tv, or season"}), 400

    has_override = None
    if has_override_raw not in (None, ""):
        lowered = str(has_override_raw).strip().lower()
        if lowered in ("1", "true", "yes", "on"):
            has_override = True
        elif lowered in ("0", "false", "no", "off"):
            has_override = False
        else:
            return jsonify({"error": "has_override must be boolean"}), 400

    sql = f"""
        {_ADMIN_CONTENT_SELECT_SQL}
        WHERE 1=1
    """
    params = []

    if media_type:
        sql += " AND t.media_type = %s"
        params.append(media_type)
    else:
        sql += " AND t.media_type = ANY(%s)"
        params.append(_ALLOWED_MEDIA_TYPES_LIST)
    if has_override is True:
        sql += " AND o.id IS NOT NULL"
    elif has_override is False:
        sql += " AND o.id IS NULL"
    if final_state:
        sql += " AND COALESCE(NULLIF(o.override_final_state, ''), c.final_state) = %s"
        params.append(final_state)
    if missing_final_date:
        sql += """
            AND COALESCE(NULLIF(o.override_final_state, ''), c.final_state) IS NOT NULL
            AND COALESCE(o.override_final_completed_at, c.final_completed_at) IS NULL
        """
    if q:
        sql += """
            AND (
                COALESCE(
                    c.payload->>'title',
                    c.payload->>'name',
                    d.payload->>'title',
                    d.payload->>'name',
                    pt.payload->>'name',
                    ptd.payload->>'name',
                    ''
                ) ILIKE %s
                OR CAST(t.tmdb_id AS TEXT) = %s
            )
        """
        params.extend([f"%{q}%", q])

    sql += """
        ORDER BY COALESCE(o.updated_at, COALESCE(c.updated_at, d.updated_at)) DESC NULLS LAST, t.tmdb_id DESC, t.season_number DESC
        LIMIT %s OFFSET %s
    """
    params.extend([limit, offset])

    db = get_db()
    cursor = get_cursor(db)
    cursor.execute(sql, tuple(params))
    items = [_serialize_admin_content(row) for row in cursor.fetchall()]
    cursor.close()

    return jsonify(
        {
            "success": True,
            "items": items,
            "limit": limit,
            "offset": offset,
        }
    )


@admin_bp.get("/contents/lookup")
@require_admin
def admin_content_lookup(payload):
    _ = payload
    media_type = _normalize_media_type(request.args.get("media_type"))
    tmdb_id = _parse_tmdb_id(request.args.get("tmdb_id"))
    season_number = _resolve_season_number(media_type, request.args.get("season_number"))

    if media_type is None:
        return jsonify({"error": "media_type must be movie, tv, or season"}), 400
    if tmdb_id is None:
        return jsonify({"error": "tmdb_id must be a positive integer"}), 400
    if season_number is None:
        return jsonify({"error": "season_number is invalid for media_type"}), 400

    db = get_db()
    row = _fetch_admin_content_row(db, media_type, tmdb_id, season_number)
    if not row:
        return jsonify({"error": "Content not found"}), 404

    content = _serialize_admin_content(row)
    return jsonify({"success": True, "content": content})


@admin_bp.get("/contents/overrides")
@require_admin
def admin_contents_overrides(payload):
    _ = payload
    limit = _bounded_int(request.args.get("limit"), default=50, minimum=1, maximum=200)
    offset = _bounded_int(request.args.get("offset"), default=0, minimum=0, maximum=100000)
    q = (request.args.get("q") or "").strip()
    media_type_raw = (request.args.get("media_type") or "").strip()

    media_type = None
    if media_type_raw and media_type_raw.lower() != "all":
        media_type = _normalize_media_type(media_type_raw)
        if media_type is None:
            return jsonify({"error": "media_type must be movie, tv, or season"}), 400

    sql = """
        SELECT
            o.id AS override_id,
            o.media_type,
            o.tmdb_id,
            o.season_number,
            o.override_status_raw,
            o.override_release_date,
            o.override_next_air_date,
            o.override_final_state,
            o.override_final_completed_at,
            o.reason AS override_reason,
            o.admin_email AS override_admin_email,
            o.created_at AS override_created_at,
            o.updated_at AS override_updated_at,
            COALESCE(c.payload, d.payload) AS payload,
            COALESCE(pt.payload, ptd.payload) AS parent_tv_payload,
            c.status_raw,
            c.final_state,
            c.final_completed_at
        FROM admin_tmdb_overrides o
        LEFT JOIN tmdb_cache c
          ON c.media_type = o.media_type
         AND c.tmdb_id = o.tmdb_id
         AND c.season_number = o.season_number
        LEFT JOIN tmdb_cache d
          ON (
              (o.media_type = 'movie' AND d.media_type = 'http:movie_detail' AND d.tmdb_id = o.tmdb_id AND d.season_number = -1)
              OR (o.media_type = 'tv' AND d.media_type = 'http:tv_detail' AND d.tmdb_id = o.tmdb_id AND d.season_number = -1)
              OR (o.media_type = 'season' AND d.media_type = 'http:tv_season_detail' AND d.tmdb_id = o.tmdb_id AND d.season_number = o.season_number)
          )
        LEFT JOIN tmdb_cache pt
          ON o.media_type = 'season'
         AND pt.media_type = 'tv'
         AND pt.tmdb_id = o.tmdb_id
         AND pt.season_number = -1
        LEFT JOIN tmdb_cache ptd
          ON o.media_type = 'season'
         AND ptd.media_type = 'http:tv_detail'
         AND ptd.tmdb_id = o.tmdb_id
         AND ptd.season_number = -1
        WHERE 1=1
    """
    params = []
    if media_type:
        sql += " AND o.media_type = %s"
        params.append(media_type)
    if q:
        sql += """
            AND (
                COALESCE(
                    c.payload->>'title',
                    c.payload->>'name',
                    d.payload->>'title',
                    d.payload->>'name',
                    pt.payload->>'name',
                    ptd.payload->>'name',
                    ''
                ) ILIKE %s
                OR CAST(o.tmdb_id AS TEXT) = %s
            )
        """
        params.extend([f"%{q}%", q])
    sql += " ORDER BY o.updated_at DESC, o.id DESC LIMIT %s OFFSET %s"
    params.extend([limit, offset])

    db = get_db()
    cursor = get_cursor(db)
    cursor.execute(sql, tuple(params))

    items = []
    for row in cursor.fetchall():
        items.append(
            {
                "media_type": row.get("media_type"),
                "tmdb_id": row.get("tmdb_id"),
                "season_number": row.get("season_number"),
                "title": _content_title_from_cache_row(
                    row.get("media_type"),
                    row.get("tmdb_id"),
                    row.get("season_number"),
                    row.get("payload"),
                    row.get("parent_tv_payload"),
                ),
                "override": _serialize_tmdb_override(row),
                "base": {
                    "status_raw": row.get("status_raw"),
                    "final_state": row.get("final_state"),
                    "final_completed_at": _iso(row.get("final_completed_at")),
                },
            }
        )
    cursor.close()

    return jsonify({"success": True, "items": items, "limit": limit, "offset": offset})


@admin_bp.post("/contents/override")
@require_admin
def admin_upsert_content_override(payload):
    body = request.get_json(silent=True) or {}

    media_type = _normalize_media_type(body.get("media_type"))
    tmdb_id = _parse_tmdb_id(body.get("tmdb_id"))
    season_number = _resolve_season_number(media_type, body.get("season_number"))

    if media_type is None:
        return jsonify({"error": "media_type must be movie, tv, or season"}), 400
    if tmdb_id is None:
        return jsonify({"error": "tmdb_id must be a positive integer"}), 400
    if season_number is None:
        return jsonify({"error": "season_number is invalid for media_type"}), 400

    db = get_db()
    if not _fetch_admin_content_row(db, media_type, tmdb_id, season_number):
        return jsonify({"error": "Content not found"}), 404

    lookup_cursor = get_cursor(db)
    try:
        lookup_cursor.execute(
            """
            SELECT
                override_status_raw,
                override_release_date,
                override_next_air_date,
                override_final_state,
                override_final_completed_at,
                reason
            FROM admin_tmdb_overrides
            WHERE media_type = %s AND tmdb_id = %s AND season_number = %s
            LIMIT 1;
            """,
            (media_type, tmdb_id, season_number),
        )
        existing = lookup_cursor.fetchone() or {}
    finally:
        lookup_cursor.close()

    override_status_raw = _resolve_optional_text(
        body,
        "override_status_raw",
        existing.get("override_status_raw"),
    )
    override_final_state = _resolve_optional_text(
        body,
        "override_final_state",
        existing.get("override_final_state"),
    )
    reason = _resolve_optional_text(body, "reason", existing.get("reason"))

    override_release_date, error_message = _resolve_optional_date(
        body,
        "override_release_date",
        existing.get("override_release_date"),
    )
    if error_message:
        return jsonify({"error": error_message}), 400

    override_next_air_date, error_message = _resolve_optional_date(
        body,
        "override_next_air_date",
        existing.get("override_next_air_date"),
    )
    if error_message:
        return jsonify({"error": error_message}), 400

    override_final_completed_at, error_message = _resolve_optional_date(
        body,
        "override_final_completed_at",
        existing.get("override_final_completed_at"),
    )
    if error_message:
        return jsonify({"error": error_message}), 400

    upsert_cursor = get_cursor(db)
    try:
        upsert_cursor.execute(
            """
            INSERT INTO admin_tmdb_overrides (
                media_type,
                tmdb_id,
                season_number,
                override_status_raw,
                override_release_date,
                override_next_air_date,
                override_final_state,
                override_final_completed_at,
                reason,
                admin_email,
                created_at,
                updated_at
            ) VALUES (
                %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW(), NOW()
            )
            ON CONFLICT (media_type, tmdb_id, season_number)
            DO UPDATE SET
                override_status_raw = EXCLUDED.override_status_raw,
                override_release_date = EXCLUDED.override_release_date,
                override_next_air_date = EXCLUDED.override_next_air_date,
                override_final_state = EXCLUDED.override_final_state,
                override_final_completed_at = EXCLUDED.override_final_completed_at,
                reason = EXCLUDED.reason,
                admin_email = EXCLUDED.admin_email,
                updated_at = NOW()
            RETURNING
                id AS override_id,
                media_type,
                tmdb_id,
                season_number,
                override_status_raw,
                override_release_date,
                override_next_air_date,
                override_final_state,
                override_final_completed_at,
                reason AS override_reason,
                admin_email AS override_admin_email,
                created_at AS override_created_at,
                updated_at AS override_updated_at;
            """,
            (
                media_type,
                tmdb_id,
                season_number,
                override_status_raw,
                override_release_date,
                override_next_air_date,
                override_final_state,
                override_final_completed_at,
                reason,
                payload.get("email"),
            ),
        )
        override_row = upsert_cursor.fetchone()
    finally:
        upsert_cursor.close()
    override_data = _serialize_tmdb_override(override_row)

    _record_content_action_log(
        db,
        action_type="OVERRIDE_UPSERT",
        media_type=media_type,
        tmdb_id=tmdb_id,
        season_number=season_number,
        reason=reason,
        admin_email=payload.get("email"),
        payload_data={"override": override_data},
    )

    db.commit()

    content_row = _fetch_admin_content_row(db, media_type, tmdb_id, season_number)
    content = _serialize_admin_content(content_row) if content_row else None

    return jsonify({"success": True, "override": override_data, "content": content})


@admin_bp.delete("/contents/override")
@require_admin
def admin_delete_content_override(payload):
    body = request.get_json(silent=True) or {}

    media_type = _normalize_media_type(body.get("media_type"))
    tmdb_id = _parse_tmdb_id(body.get("tmdb_id"))
    season_number = _resolve_season_number(media_type, body.get("season_number"))
    reason = _resolve_optional_text(body, "reason", None)

    if media_type is None:
        return jsonify({"error": "media_type must be movie, tv, or season"}), 400
    if tmdb_id is None:
        return jsonify({"error": "tmdb_id must be a positive integer"}), 400
    if season_number is None:
        return jsonify({"error": "season_number is invalid for media_type"}), 400

    db = get_db()
    cursor = get_cursor(db)
    try:
        cursor.execute(
            """
            DELETE FROM admin_tmdb_overrides
            WHERE media_type = %s AND tmdb_id = %s AND season_number = %s
            RETURNING
                id AS override_id,
                media_type,
                tmdb_id,
                season_number,
                override_status_raw,
                override_release_date,
                override_next_air_date,
                override_final_state,
                override_final_completed_at,
                reason AS override_reason,
                admin_email AS override_admin_email,
                created_at AS override_created_at,
                updated_at AS override_updated_at;
            """,
            (media_type, tmdb_id, season_number),
        )
        deleted_override = cursor.fetchone()
    finally:
        cursor.close()
    if not deleted_override:
        return jsonify({"error": "Override not found"}), 404

    _record_content_action_log(
        db,
        action_type="OVERRIDE_DELETE",
        media_type=media_type,
        tmdb_id=tmdb_id,
        season_number=season_number,
        reason=reason,
        admin_email=payload.get("email"),
        payload_data={"deleted_override": _serialize_tmdb_override(deleted_override)},
    )
    db.commit()

    content_row = _fetch_admin_content_row(db, media_type, tmdb_id, season_number)
    content = _serialize_admin_content(content_row) if content_row else None

    return jsonify({"success": True, "content": content})


@admin_bp.get("/contents/missing-final-date")
@require_admin
def admin_contents_missing_final_date(payload):
    _ = payload
    limit = _bounded_int(request.args.get("limit"), default=50, minimum=1, maximum=200)
    offset = _bounded_int(request.args.get("offset"), default=0, minimum=0, maximum=100000)
    q = (request.args.get("q") or "").strip()
    media_type_raw = (request.args.get("media_type") or "").strip()

    media_type = None
    if media_type_raw and media_type_raw.lower() != "all":
        media_type = _normalize_media_type(media_type_raw)
        if media_type is None:
            return jsonify({"error": "media_type must be movie, tv, or season"}), 400

    sql = f"""
        {_ADMIN_CONTENT_SELECT_SQL}
        WHERE COALESCE(NULLIF(o.override_final_state, ''), c.final_state) IS NOT NULL
          AND COALESCE(o.override_final_completed_at, c.final_completed_at) IS NULL
    """
    params = []
    if media_type:
        sql += " AND t.media_type = %s"
        params.append(media_type)
    else:
        sql += " AND t.media_type = ANY(%s)"
        params.append(_ALLOWED_MEDIA_TYPES_LIST)
    if q:
        sql += """
            AND (
                COALESCE(
                    c.payload->>'title',
                    c.payload->>'name',
                    d.payload->>'title',
                    d.payload->>'name',
                    pt.payload->>'name',
                    ptd.payload->>'name',
                    ''
                ) ILIKE %s
                OR CAST(t.tmdb_id AS TEXT) = %s
            )
        """
        params.extend([f"%{q}%", q])
    sql += """
        ORDER BY COALESCE(o.updated_at, COALESCE(c.updated_at, d.updated_at)) DESC NULLS LAST, t.tmdb_id DESC, t.season_number DESC
        LIMIT %s OFFSET %s
    """
    params.extend([limit, offset])

    db = get_db()
    cursor = get_cursor(db)
    cursor.execute(sql, tuple(params))
    items = [_serialize_admin_content(row) for row in cursor.fetchall()]
    cursor.close()

    return jsonify({"success": True, "items": items, "limit": limit, "offset": offset})


@admin_bp.get("/audit/logs")
@require_admin
def admin_content_audit_logs(payload):
    _ = payload
    limit = _bounded_int(request.args.get("limit"), default=50, minimum=1, maximum=200)
    offset = _bounded_int(request.args.get("offset"), default=0, minimum=0, maximum=100000)
    q = (request.args.get("q") or "").strip()
    action_type = (request.args.get("action_type") or "").strip()
    media_type_raw = (request.args.get("media_type") or "").strip()
    tmdb_id_raw = (request.args.get("tmdb_id") or "").strip()

    media_type = None
    if media_type_raw and media_type_raw.lower() != "all":
        media_type = _normalize_media_type(media_type_raw)
        if media_type is None:
            return jsonify({"error": "media_type must be movie, tv, or season"}), 400

    if action_type and action_type not in _ALLOWED_CONTENT_ACTION_TYPES:
        return jsonify({"error": "unsupported action_type"}), 400

    tmdb_id = None
    if tmdb_id_raw:
        tmdb_id = _parse_tmdb_id(tmdb_id_raw)
        if tmdb_id is None:
            return jsonify({"error": "tmdb_id must be a positive integer"}), 400

    sql = """
        SELECT
            l.id,
            l.created_at,
            l.action_type,
            l.reason,
            l.admin_email,
            l.media_type,
            l.tmdb_id,
            l.season_number,
            l.payload,
            COALESCE(c.payload, d.payload) AS cache_payload,
            COALESCE(pt.payload, ptd.payload) AS parent_tv_payload,
            c.status_raw,
            c.final_state,
            c.final_completed_at,
            o.override_final_state,
            o.override_final_completed_at
        FROM admin_content_action_logs l
        LEFT JOIN tmdb_cache c
          ON c.media_type = l.media_type
         AND c.tmdb_id = l.tmdb_id
         AND c.season_number = l.season_number
        LEFT JOIN tmdb_cache d
          ON (
              (l.media_type = 'movie' AND d.media_type = 'http:movie_detail' AND d.tmdb_id = l.tmdb_id AND d.season_number = -1)
              OR (l.media_type = 'tv' AND d.media_type = 'http:tv_detail' AND d.tmdb_id = l.tmdb_id AND d.season_number = -1)
              OR (l.media_type = 'season' AND d.media_type = 'http:tv_season_detail' AND d.tmdb_id = l.tmdb_id AND d.season_number = l.season_number)
          )
        LEFT JOIN tmdb_cache pt
          ON l.media_type = 'season'
         AND pt.media_type = 'tv'
         AND pt.tmdb_id = l.tmdb_id
         AND pt.season_number = -1
        LEFT JOIN tmdb_cache ptd
          ON l.media_type = 'season'
         AND ptd.media_type = 'http:tv_detail'
         AND ptd.tmdb_id = l.tmdb_id
         AND ptd.season_number = -1
        LEFT JOIN admin_tmdb_overrides o
          ON o.media_type = l.media_type
         AND o.tmdb_id = l.tmdb_id
         AND o.season_number = l.season_number
        WHERE 1=1
    """
    params = []
    if action_type:
        sql += " AND l.action_type = %s"
        params.append(action_type)
    if media_type:
        sql += " AND l.media_type = %s"
        params.append(media_type)
    if tmdb_id is not None:
        sql += " AND l.tmdb_id = %s"
        params.append(tmdb_id)
    if q:
        sql += """
            AND (
                COALESCE(
                    c.payload->>'title',
                    c.payload->>'name',
                    d.payload->>'title',
                    d.payload->>'name',
                    pt.payload->>'name',
                    ptd.payload->>'name',
                    ''
                ) ILIKE %s
                OR CAST(l.tmdb_id AS TEXT) = %s
            )
        """
        params.extend([f"%{q}%", q])

    sql += " ORDER BY l.created_at DESC, l.id DESC LIMIT %s OFFSET %s"
    params.extend([limit, offset])

    db = get_db()
    cursor = get_cursor(db)
    cursor.execute(sql, tuple(params))

    logs = []
    for row in cursor.fetchall():
        title = _content_title_from_cache_row(
            row.get("media_type"),
            row.get("tmdb_id"),
            row.get("season_number"),
            row.get("cache_payload"),
            row.get("parent_tv_payload"),
        )
        effective_final_state = row.get("override_final_state") or row.get("final_state")
        effective_final_completed_at = _iso(
            row.get("override_final_completed_at") or row.get("final_completed_at")
        )
        logs.append(
            {
                "id": row.get("id"),
                "created_at": _iso(row.get("created_at")),
                "action_type": row.get("action_type"),
                "reason": row.get("reason"),
                "admin_email": row.get("admin_email"),
                "media_type": row.get("media_type"),
                "tmdb_id": row.get("tmdb_id"),
                "season_number": row.get("season_number"),
                "title": title,
                "base_status_raw": row.get("status_raw"),
                "base_final_state": row.get("final_state"),
                "base_final_completed_at": _iso(row.get("final_completed_at")),
                "effective_final_state": effective_final_state,
                "effective_final_completed_at": effective_final_completed_at,
                "payload": _as_json_object(row.get("payload")),
            }
        )
    cursor.close()

    return jsonify({"success": True, "logs": logs, "limit": limit, "offset": offset})


@admin_bp.post("/users/<int:user_id>/refresh")
@require_admin
def admin_refresh_user(payload, user_id):
    _ = payload
    body = request.get_json(silent=True) or {}
    force = body.get("force", True)
    if not isinstance(force, bool):
        force = True

    started_at = time.perf_counter()
    db = get_db()
    cursor = get_cursor(db)
    cursor.execute(
        """
        SELECT id, email
        FROM users
        WHERE id = %s;
        """,
        (user_id,),
    )
    user = cursor.fetchone()
    if not user:
        return jsonify({"error": "User not found"}), 404

    cursor.execute(
        """
        SELECT
            f.id,
            f.user_id,
            f.target_type,
            f.tmdb_id,
            f.season_number,
            p.notify_date_changes,
            p.notify_status_milestones,
            p.notify_season_binge_ready,
            p.notify_episode_drops,
            p.notify_full_run_concluded,
            p.channel_email,
            p.channel_whatsapp,
            p.frequency
        FROM follows f
        JOIN follow_prefs p ON p.follow_id = f.id
        WHERE f.user_id = %s
        ORDER BY f.id ASC;
        """,
        (user_id,),
    )
    follows = cursor.fetchall()

    event_counts = {}
    for follow in follows:
        emitted = refresh_follow(db, follow, None, follow, force_fetch=force, emit_events=True)
        for event_name in emitted:
            event_counts[event_name] = event_counts.get(event_name, 0) + 1

    _record_admin_job_report(
        db,
        "refresh_user",
        "success",
        {
            "user_id": user_id,
            "user_email": user["email"],
            "refreshed": len(follows),
            "events_emitted": sum(event_counts.values()),
            "event_counts": event_counts,
            "force_fetch": force,
            "duration_seconds": time.perf_counter() - started_at,
            "admin_email": payload.get("email"),
        },
    )
    db.commit()

    return jsonify(
        {
            "user": {"id": user["id"], "email": user["email"]},
            "refreshed": len(follows),
            "events_emitted": sum(event_counts.values()),
            "event_counts": event_counts,
            "force": force,
        }
    )


@admin_bp.get("/events")
@require_admin
def admin_events(payload):
    _ = payload
    q = (request.args.get("q") or "").strip()
    limit = _bounded_int(request.args.get("limit"), default=30, minimum=1, maximum=100)

    where_sql = ""
    where_params = []
    if q:
        where_sql = "WHERE u.email ILIKE %s OR CAST(u.id AS TEXT) = %s OR CAST(f.tmdb_id AS TEXT) = %s"
        where_params = [f"%{q}%", q, q]

    db = get_db()
    cursor = get_cursor(db)

    cursor.execute(
        f"""
        SELECT
            e.id,
            e.created_at,
            e.event_type,
            e.event_payload,
            e.follow_id,
            u.id AS user_id,
            u.email,
            f.target_type,
            f.tmdb_id,
            f.season_number,
            c.payload AS cache_payload
        FROM change_events e
        JOIN users u ON u.id = e.user_id
        LEFT JOIN follows f ON f.id = e.follow_id
        {_CACHE_JOIN_SQL}
        {where_sql}
        ORDER BY e.created_at DESC
        LIMIT %s;
        """,
        tuple(where_params + [limit]),
    )
    change_events = cursor.fetchall()
    for event in change_events:
        event["title"] = _title_from_cache(event.get("target_type"), event.get("cache_payload"))

    cursor.execute(
        f"""
        SELECT
            o.id,
            o.created_at,
            o.sent_at,
            o.channel,
            o.status,
            o.attempt_count,
            o.last_error,
            o.payload,
            o.follow_id,
            u.id AS user_id,
            u.email,
            f.target_type,
            f.tmdb_id,
            f.season_number,
            c.payload AS cache_payload
        FROM notification_outbox o
        JOIN users u ON u.id = o.user_id
        LEFT JOIN follows f ON f.id = o.follow_id
        {_CACHE_JOIN_SQL}
        {where_sql}
        ORDER BY o.created_at DESC
        LIMIT %s;
        """,
        tuple(where_params + [limit]),
    )
    outbox_items = cursor.fetchall()
    for item in outbox_items:
        title = _title_from_cache(item.get("target_type"), item.get("cache_payload"))
        if not title and isinstance(item.get("payload"), dict):
            title = item["payload"].get("title")
        item["title"] = title
        payload_data = item.get("payload") or {}
        item["summary"] = (
            payload_data.get("subject")
            or payload_data.get("event_type")
            or f"{item.get('channel', 'channel')}:{item.get('status', 'unknown')}"
        )

    return jsonify({"q": q, "limit": limit, "change_events": change_events, "outbox": outbox_items})


@admin_bp.get("/cdc/events")
@require_admin
def admin_cdc_events(payload):
    _ = payload
    limit = _bounded_int(request.args.get("limit"), default=50, minimum=1, maximum=200)
    offset = _bounded_int(request.args.get("offset"), default=0, minimum=0, maximum=100000)

    q = (request.args.get("q") or "").strip()
    event_type = (request.args.get("event_type") or "").strip()
    source = (request.args.get("source") or "").strip()
    if source == "all":
        source = ""
    content_id = (request.args.get("content_id") or "").strip()
    created_from = _parse_datetime_param(request.args.get("created_from"))
    created_to = _parse_datetime_param(request.args.get("created_to"))
    if request.args.get("created_from") and created_from is None:
        return jsonify({"error": "created_from must be ISO-8601 datetime"}), 400
    if request.args.get("created_to") and created_to is None:
        return jsonify({"error": "created_to must be ISO-8601 datetime"}), 400

    sql = f"""
        SELECT
            e.id,
            e.created_at,
            e.event_type,
            e.event_payload,
            e.follow_id,
            u.id AS user_id,
            u.email AS user_email,
            f.target_type,
            f.tmdb_id,
            f.season_number,
            c.payload AS cache_payload
        FROM change_events e
        JOIN users u ON u.id = e.user_id
        LEFT JOIN follows f ON f.id = e.follow_id
        {_CACHE_JOIN_SQL}
        WHERE 1=1
    """
    params = []

    if event_type:
        sql += " AND e.event_type = %s"
        params.append(event_type)
    if source:
        sql += " AND f.target_type = %s"
        params.append(source)
    if content_id:
        sql += " AND CAST(f.tmdb_id AS TEXT) = %s"
        params.append(content_id)
    if created_from:
        sql += " AND e.created_at >= %s"
        params.append(created_from)
    if created_to:
        sql += " AND e.created_at <= %s"
        params.append(created_to)
    if q:
        sql += " AND (u.email ILIKE %s OR CAST(f.tmdb_id AS TEXT) = %s)"
        params.extend([f"%{q}%", q])

    sql += " ORDER BY e.created_at DESC, e.id DESC LIMIT %s OFFSET %s"
    params.extend([limit, offset])

    db = get_db()
    cursor = get_cursor(db)
    cursor.execute(sql, tuple(params))
    rows = cursor.fetchall()
    events = []
    for row in rows:
        title = _title_from_cache(row.get("target_type"), row.get("cache_payload"))
        created_at = row.get("created_at")
        events.append(
            {
                "id": row.get("id"),
                "created_at": created_at.isoformat() if created_at else None,
                "event_type": row.get("event_type"),
                "event_payload": row.get("event_payload"),
                "follow_id": row.get("follow_id"),
                "user_id": row.get("user_id"),
                "user_email": row.get("user_email"),
                "source": row.get("target_type"),
                "content_id": str(row.get("tmdb_id")) if row.get("tmdb_id") is not None else None,
                "tmdb_id": row.get("tmdb_id"),
                "season_number": row.get("season_number"),
                "title": title,
            }
        )

    return jsonify({"success": True, "events": events, "limit": limit, "offset": offset})


@admin_bp.get("/outbox/summary")
@require_admin
def admin_outbox_summary(payload):
    _ = payload
    db = get_db()
    cursor = get_cursor(db)

    cursor.execute(
        """
        SELECT status, COUNT(*) AS count
        FROM notification_outbox
        GROUP BY status
        ORDER BY status ASC;
        """
    )
    by_status = {row["status"]: row["count"] for row in cursor.fetchall()}

    cursor.execute(
        """
        SELECT channel, status, COUNT(*) AS count
        FROM notification_outbox
        GROUP BY channel, status
        ORDER BY channel ASC, status ASC;
        """
    )
    by_channel_and_status = cursor.fetchall()

    cursor.execute(
        """
        SELECT MIN(created_at) AS oldest_pending_created_at
        FROM notification_outbox
        WHERE status = 'pending';
        """
    )
    oldest_pending_created_at = cursor.fetchone()["oldest_pending_created_at"]

    cursor.execute(
        """
        SELECT
            o.id,
            o.user_id,
            u.email,
            o.channel,
            o.status,
            o.attempt_count,
            o.last_error,
            o.created_at
        FROM notification_outbox o
        JOIN users u ON u.id = o.user_id
        WHERE o.status = 'failed'
        ORDER BY o.created_at DESC
        LIMIT 20;
        """
    )
    recent_failures = cursor.fetchall()

    return jsonify(
        {
            "by_status": by_status,
            "by_channel_and_status": by_channel_and_status,
            "oldest_pending_created_at": oldest_pending_created_at,
            "recent_failures": recent_failures,
        }
    )


@admin_bp.get("/reports/daily-crawler")
@require_admin
def admin_daily_crawler_reports(payload):
    _ = payload
    limit = _bounded_int(request.args.get("limit"), default=50, minimum=1, maximum=200)
    offset = _bounded_int(request.args.get("offset"), default=0, minimum=0, maximum=100000)
    crawler_name = (request.args.get("crawler_name") or "").strip()
    status = (request.args.get("status") or "").strip()
    created_from = _parse_datetime_param(request.args.get("created_from"))
    created_to = _parse_datetime_param(request.args.get("created_to"))
    if request.args.get("created_from") and created_from is None:
        return jsonify({"error": "created_from must be ISO-8601 datetime"}), 400
    if request.args.get("created_to") and created_to is None:
        return jsonify({"error": "created_to must be ISO-8601 datetime"}), 400

    sql = """
        SELECT id, job_name, status, report_data, created_at
        FROM admin_job_reports
        WHERE 1=1
    """
    params = []

    if crawler_name:
        sql += " AND job_name = %s"
        params.append(crawler_name)
    if status:
        expanded = expand_status_filter(status)
        if expanded:
            sql += " AND status = ANY(%s)"
            params.append(expanded)
        else:
            sql += " AND status = %s"
            params.append(status)
    if created_from:
        sql += " AND created_at >= %s"
        params.append(created_from)
    if created_to:
        sql += " AND created_at <= %s"
        params.append(created_to)

    sql += " ORDER BY created_at DESC, id DESC LIMIT %s OFFSET %s"
    params.extend([limit, offset])

    db = get_db()
    cursor = get_cursor(db)
    cursor.execute(sql, tuple(params))
    reports = [_serialize_admin_job_report(row) for row in cursor.fetchall()]

    return jsonify({"success": True, "reports": reports, "limit": limit, "offset": offset})


@admin_bp.get("/reports/daily-summary")
@require_admin
def admin_daily_summary(payload):
    _ = payload
    created_from = _parse_datetime_param(request.args.get("created_from"))
    created_to = _parse_datetime_param(request.args.get("created_to"))
    if request.args.get("created_from") and created_from is None:
        return jsonify({"error": "created_from must be ISO-8601 datetime"}), 400
    if request.args.get("created_to") and created_to is None:
        return jsonify({"error": "created_to must be ISO-8601 datetime"}), 400

    now = datetime.utcnow()
    if created_from is None and created_to is None:
        created_from = datetime(now.year, now.month, now.day, 0, 0, 0)
        created_to = now

    sql = """
        SELECT id, job_name, status, report_data, created_at
        FROM admin_job_reports
        WHERE 1=1
    """
    params = []
    if created_from:
        sql += " AND created_at >= %s"
        params.append(created_from)
    if created_to:
        sql += " AND created_at <= %s"
        params.append(created_to)
    sql += " ORDER BY created_at DESC, id DESC"

    db = get_db()
    cursor = get_cursor(db)
    cursor.execute(sql, tuple(params))
    items = [_serialize_admin_job_report(row) for row in cursor.fetchall()]

    range_label = None
    if created_from and created_to:
        range_label = f"{created_from.isoformat()} ~ {created_to.isoformat()}"
    elif created_from:
        range_label = f"{created_from.isoformat()} ~ -"
    elif created_to:
        range_label = f"- ~ {created_to.isoformat()}"

    date_basis = created_to or created_from or now
    date_label = date_basis.strftime("%Y-%m-%d")
    summary_payload = build_daily_summary(items, range_label, date_label)

    return jsonify(
        {
            "success": True,
            "range": {
                "created_from": created_from.isoformat() if created_from else None,
                "created_to": created_to.isoformat() if created_to else None,
            },
            "overall_status": summary_payload["overall_status"],
            "subject_text": summary_payload["subject_text"],
            "summary_text": summary_payload["summary_text"],
            "total_reports": len(items),
            "counts": summary_payload["counts"],
            "items": items,
        }
    )


@admin_bp.get("/reports/daily-notification")
@require_admin
def admin_daily_notification_report(payload):
    _ = payload
    date_raw = request.args.get("date")
    include_failed = _parse_bool_param(request.args.get("include_failed"), default=False)
    include_pending = _parse_bool_param(request.args.get("include_pending"), default=False)

    report_date = _parse_date_param(date_raw)
    if date_raw and report_date is None:
        return jsonify({"error": "date must be YYYY-MM-DD"}), 400
    if report_date is None:
        report_date = datetime.utcnow().date()

    start_dt = datetime(report_date.year, report_date.month, report_date.day, 0, 0, 0)
    end_dt = start_dt + timedelta(days=1)
    generated_at = datetime.utcnow()

    db = get_db()
    cursor = get_cursor(db)
    cursor.execute(
        f"""
        SELECT
            o.id,
            o.channel,
            o.status,
            o.created_at,
            o.sent_at,
            o.last_error,
            u.email AS user_email,
            f.target_type,
            f.tmdb_id,
            f.season_number,
            c.payload AS cache_payload,
            o.payload
        FROM notification_outbox o
        JOIN users u ON u.id = o.user_id
        LEFT JOIN follows f ON f.id = o.follow_id
        {_CACHE_JOIN_SQL}
        WHERE o.created_at >= %s AND o.created_at < %s
        ORDER BY o.created_at DESC, o.id DESC
        """,
        (start_dt, end_dt),
    )
    raw_rows = cursor.fetchall()

    cursor.execute(
        """
        SELECT event_type, COUNT(*) AS count
        FROM change_events
        WHERE created_at >= %s AND created_at < %s
        GROUP BY event_type
        ORDER BY event_type ASC
        """,
        (start_dt, end_dt),
    )
    event_counts = {row["event_type"]: row["count"] for row in cursor.fetchall()}

    cursor.execute(
        """
        SELECT report_data
        FROM admin_job_reports
        WHERE created_at >= %s AND created_at < %s
        """,
        (start_dt, end_dt),
    )
    duration_seconds = 0.0
    duration_found = False
    for row in cursor.fetchall():
        report_data = parse_report_data(row.get("report_data"))
        value = report_data.get("duration_seconds")
        if isinstance(value, (int, float)):
            duration_seconds += float(value)
            duration_found = True

    items = []
    status_counts = {"sent": 0, "pending": 0, "failed": 0, "other": 0}
    unique_recipients = set()
    for row in raw_rows:
        status = (row.get("status") or "").strip().lower()
        if status == "failed" and not include_failed:
            continue
        if status in ("pending", "sending") and not include_pending:
            continue
        title = _title_from_cache(row.get("target_type"), row.get("cache_payload"))
        if not title and isinstance(row.get("payload"), dict):
            title = row["payload"].get("title")
        if status in status_counts:
            status_counts[status] += 1
        elif status == "sending":
            status_counts["pending"] += 1
        else:
            status_counts["other"] += 1
        if status == "sent" and row.get("user_email"):
            unique_recipients.add(row["user_email"])
        created_at = row.get("created_at")
        sent_at = row.get("sent_at")
        items.append(
            {
                "id": row.get("id"),
                "title": title,
                "channel": row.get("channel"),
                "status": row.get("status"),
                "user_email": row.get("user_email"),
                "target_type": row.get("target_type"),
                "tmdb_id": row.get("tmdb_id"),
                "season_number": row.get("season_number"),
                "created_at": created_at.isoformat() if created_at else None,
                "sent_at": sent_at.isoformat() if sent_at else None,
                "last_error": row.get("last_error"),
            }
        )

    stats = {
        "date": report_date.isoformat(),
        "duration_seconds": duration_seconds if duration_found else None,
        "total_items": len(items),
        "sent_count": status_counts["sent"],
        "pending_count": status_counts["pending"],
        "failed_count": status_counts["failed"],
        "other_count": status_counts["other"],
        "unique_recipients": len(unique_recipients),
        "event_counts": event_counts,
    }
    text_report = build_daily_notification_text(generated_at.isoformat(), stats, items)

    return jsonify(
        {
            "success": True,
            "date": report_date.isoformat(),
            "range": {"from": start_dt.isoformat(), "to": end_dt.isoformat()},
            "generated_at": generated_at.isoformat(),
            "stats": stats,
            "completed_items": items,
            "items": items,
            "text_report": text_report,
        }
    )


@admin_bp.post("/reports/daily-crawler/cleanup")
@require_admin
def admin_daily_crawler_cleanup(payload):
    _ = payload
    body = request.get_json(silent=True) or {}
    keep_days = _bounded_int(body.get("keep_days"), default=14, minimum=1, maximum=365)
    cutoff = datetime.utcnow() - timedelta(days=keep_days)

    db = get_db()
    cursor = get_cursor(db)
    cursor.execute("DELETE FROM admin_job_reports WHERE created_at < %s", (cutoff,))
    deleted_count = cursor.rowcount
    db.commit()

    return jsonify(
        {
            "success": True,
            "deleted_count": deleted_count,
            "cutoff": cutoff.isoformat(),
            "keep_days": keep_days,
        }
    )


@admin_bp.post("/ops/dispatch-email")
@require_admin
def admin_dispatch_email(payload):
    _ = payload
    body = request.get_json(silent=True) or {}
    batch_size = _bounded_int(
        body.get("batch_size"),
        default=config.CRON_DISPATCH_BATCH_SIZE,
        minimum=1,
        maximum=500,
    )

    started_at = time.perf_counter()
    provider = build_email_provider_from_config()
    if provider is None and not config.EMAIL_DISPATCH_DRY_RUN:
        db = get_db()
        _record_admin_job_report(
            db,
            "dispatch_email",
            "failure",
            {
                "message": "EMAIL not enabled.",
                "batch_size": batch_size,
                "dry_run": config.EMAIL_DISPATCH_DRY_RUN,
                "duration_seconds": time.perf_counter() - started_at,
                "admin_email": payload.get("email"),
            },
        )
        db.commit()
        return jsonify({"error": "EMAIL not enabled."}), 503

    db = get_db()
    try:
        summary = dispatch_email_outbox_once(
            db,
            provider=provider,
            app_base_url=config.APP_BASE_URL,
            batch_size=batch_size,
            max_attempts=config.EMAIL_DISPATCH_MAX_ATTEMPTS,
            stale_minutes=config.EMAIL_DISPATCH_STALE_SENDING_MINUTES,
            backoff_base=config.EMAIL_DISPATCH_BACKOFF_BASE_SECONDS,
            backoff_max=config.EMAIL_DISPATCH_BACKOFF_MAX_SECONDS,
            dry_run=config.EMAIL_DISPATCH_DRY_RUN,
        )
        status = "success"
        if (summary.get("failed") or 0) > 0:
            status = "failure"
        elif (summary.get("retried") or 0) > 0:
            status = "warning"
        _record_admin_job_report(
            db,
            "dispatch_email",
            status,
            {
                "summary": summary,
                "batch_size": batch_size,
                "dry_run": config.EMAIL_DISPATCH_DRY_RUN,
                "duration_seconds": time.perf_counter() - started_at,
                "admin_email": payload.get("email"),
            },
        )
        db.commit()
        return jsonify(
            {
                "ok": True,
                "dry_run": config.EMAIL_DISPATCH_DRY_RUN,
                "batch_size": batch_size,
                "summary": summary,
            }
        )
    except Exception as exc:
        db.rollback()
        _record_admin_job_report(
            db,
            "dispatch_email",
            "failure",
            {
                "error": str(exc),
                "batch_size": batch_size,
                "dry_run": config.EMAIL_DISPATCH_DRY_RUN,
                "duration_seconds": time.perf_counter() - started_at,
                "admin_email": payload.get("email"),
            },
        )
        db.commit()
        return jsonify({"error": "Dispatch failed.", "detail": str(exc)}), 500


@admin_bp.post("/ops/refresh-all")
@require_admin
def admin_refresh_all(payload):
    _ = payload
    body = request.get_json(silent=True) or {}

    limit_users = _optional_positive_int(body.get("limit_users"))
    if limit_users is None:
        limit_users = config.CRON_REFRESH_LIMIT_USERS

    limit_follows = _optional_positive_int(body.get("limit_follows"))
    if limit_follows is None:
        limit_follows = config.CRON_REFRESH_LIMIT_FOLLOWS

    force = body.get("force", False)
    if not isinstance(force, bool):
        force = False

    started_at = time.perf_counter()
    db = get_db()
    try:
        summary = refresh_all_follows(
            db,
            limit_users=limit_users,
            limit_follows=limit_follows,
            force_fetch=force,
        )
        status = "success"
        if (summary.get("events_emitted") or 0) == 0 and (summary.get("processed_follows") or 0) > 0:
            status = "warning"
        _record_admin_job_report(
            db,
            "refresh_all",
            status,
            {
                "summary": summary,
                "limit_users": limit_users,
                "limit_follows": limit_follows,
                "force_fetch": force,
                "duration_seconds": time.perf_counter() - started_at,
                "admin_email": payload.get("email"),
            },
        )
        db.commit()
        return jsonify(
            {
                "ok": True,
                "summary": summary,
                "limit_users": limit_users,
                "limit_follows": limit_follows,
                "force": force,
            }
        )
    except Exception as exc:
        db.rollback()
        _record_admin_job_report(
            db,
            "refresh_all",
            "failure",
            {
                "error": str(exc),
                "limit_users": limit_users,
                "limit_follows": limit_follows,
                "force_fetch": force,
                "duration_seconds": time.perf_counter() - started_at,
                "admin_email": payload.get("email"),
            },
        )
        db.commit()
        return jsonify({"error": "Refresh-all failed.", "detail": str(exc)}), 500
