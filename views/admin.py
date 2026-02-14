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
