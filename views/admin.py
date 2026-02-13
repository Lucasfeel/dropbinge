from flask import Blueprint, jsonify, request

import config
from database import get_cursor, get_db
from services.email_provider import build_email_provider_from_config
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

    provider = build_email_provider_from_config()
    if provider is None and not config.EMAIL_DISPATCH_DRY_RUN:
        return jsonify({"error": "EMAIL not enabled."}), 503

    db = get_db()
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
    return jsonify(
        {
            "ok": True,
            "dry_run": config.EMAIL_DISPATCH_DRY_RUN,
            "batch_size": batch_size,
            "summary": summary,
        }
    )


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

    db = get_db()
    summary = refresh_all_follows(
        db,
        limit_users=limit_users,
        limit_follows=limit_follows,
        force_fetch=force,
    )
    return jsonify(
        {
            "ok": True,
            "summary": summary,
            "limit_users": limit_users,
            "limit_follows": limit_follows,
            "force": force,
        }
    )
