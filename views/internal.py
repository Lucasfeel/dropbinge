import time
from datetime import datetime, timedelta

from flask import Blueprint, jsonify, request
from psycopg2.extras import Json

import config
from database import get_cursor, get_db
from services.email_provider import build_email_provider_from_config
from services.outbox_dispatcher import dispatch_email_outbox_once
from services.refresh_all_service import refresh_all_follows

internal_bp = Blueprint("internal", __name__, url_prefix="/api/internal")


def _validate_cron_secret(req):
    if not config.CRON_SECRET:
        return {"error": "CRON_SECRET is not configured."}, 503
    header = req.headers.get("X-CRON-SECRET")
    if not header or header != config.CRON_SECRET:
        return {"error": "Unauthorized."}, 401
    return None


def _parse_optional_limit(raw_value):
    if raw_value is None:
        return None
    try:
        value = int(raw_value)
    except ValueError:
        return None
    if value <= 0:
        return None
    return value


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


@internal_bp.post("/dispatch-email")
def dispatch_email():
    auth_error = _validate_cron_secret(request)
    if auth_error:
        return jsonify(auth_error[0]), auth_error[1]

    started_at = time.perf_counter()
    provider = build_email_provider_from_config()
    conn = get_db()
    if provider is None and not config.EMAIL_DISPATCH_DRY_RUN:
        _record_admin_job_report(
            conn,
            "dispatch_email",
            "failure",
            {
                "message": "EMAIL not enabled.",
                "batch_size": config.CRON_DISPATCH_BATCH_SIZE,
                "dry_run": config.EMAIL_DISPATCH_DRY_RUN,
                "duration_seconds": time.perf_counter() - started_at,
                "trigger": "cron",
            },
        )
        conn.commit()
        return jsonify({"error": "EMAIL not enabled."}), 503

    try:
        summary = dispatch_email_outbox_once(
            conn,
            provider=provider,
            app_base_url=config.APP_BASE_URL,
            batch_size=config.CRON_DISPATCH_BATCH_SIZE,
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
            conn,
            "dispatch_email",
            status,
            {
                "summary": summary,
                "batch_size": config.CRON_DISPATCH_BATCH_SIZE,
                "dry_run": config.EMAIL_DISPATCH_DRY_RUN,
                "duration_seconds": time.perf_counter() - started_at,
                "trigger": "cron",
            },
        )
        conn.commit()
        return jsonify({"ok": True, "summary": summary})
    except Exception as exc:
        conn.rollback()
        _record_admin_job_report(
            conn,
            "dispatch_email",
            "failure",
            {
                "error": str(exc),
                "batch_size": config.CRON_DISPATCH_BATCH_SIZE,
                "dry_run": config.EMAIL_DISPATCH_DRY_RUN,
                "duration_seconds": time.perf_counter() - started_at,
                "trigger": "cron",
            },
        )
        conn.commit()
        return jsonify({"error": "Dispatch failed.", "detail": str(exc)}), 500


@internal_bp.post("/refresh-all")
def refresh_all():
    auth_error = _validate_cron_secret(request)
    if auth_error:
        return jsonify(auth_error[0]), auth_error[1]

    limit_users = _parse_optional_limit(request.args.get("limit_users"))
    limit_follows = _parse_optional_limit(request.args.get("limit_follows"))
    if limit_users is None:
        limit_users = config.CRON_REFRESH_LIMIT_USERS
    if limit_follows is None:
        limit_follows = config.CRON_REFRESH_LIMIT_FOLLOWS

    started_at = time.perf_counter()
    conn = get_db()
    try:
        summary = refresh_all_follows(
            conn,
            limit_users=limit_users,
            limit_follows=limit_follows,
            force_fetch=False,
        )
        status = "success"
        if (summary.get("events_emitted") or 0) == 0 and (summary.get("processed_follows") or 0) > 0:
            status = "warning"
        _record_admin_job_report(
            conn,
            "refresh_all",
            status,
            {
                "summary": summary,
                "limit_users": limit_users,
                "limit_follows": limit_follows,
                "force_fetch": False,
                "duration_seconds": time.perf_counter() - started_at,
                "trigger": "cron",
            },
        )
        conn.commit()
        return jsonify({"ok": True, "summary": summary})
    except Exception as exc:
        conn.rollback()
        _record_admin_job_report(
            conn,
            "refresh_all",
            "failure",
            {
                "error": str(exc),
                "limit_users": limit_users,
                "limit_follows": limit_follows,
                "force_fetch": False,
                "duration_seconds": time.perf_counter() - started_at,
                "trigger": "cron",
            },
        )
        conn.commit()
        return jsonify({"error": "Refresh-all failed.", "detail": str(exc)}), 500


@internal_bp.post("/cleanup-reports")
def cleanup_reports():
    auth_error = _validate_cron_secret(request)
    if auth_error:
        return jsonify(auth_error[0]), auth_error[1]

    keep_days = _parse_optional_limit(request.args.get("keep_days"))
    if keep_days is None:
        keep_days = 14
    keep_days = max(1, min(keep_days, 365))
    cutoff = datetime.utcnow() - timedelta(days=keep_days)

    started_at = time.perf_counter()
    conn = get_db()
    cursor = get_cursor(conn)
    try:
        cursor.execute("DELETE FROM admin_job_reports WHERE created_at < %s", (cutoff,))
        deleted_count = cursor.rowcount
        _record_admin_job_report(
            conn,
            "cleanup_reports",
            "success",
            {
                "deleted_count": deleted_count,
                "cutoff": cutoff.isoformat(),
                "keep_days": keep_days,
                "duration_seconds": time.perf_counter() - started_at,
                "trigger": "cron",
            },
        )
        conn.commit()
        return jsonify(
            {
                "ok": True,
                "deleted_count": deleted_count,
                "cutoff": cutoff.isoformat(),
                "keep_days": keep_days,
            }
        )
    except Exception as exc:
        conn.rollback()
        _record_admin_job_report(
            conn,
            "cleanup_reports",
            "failure",
            {
                "error": str(exc),
                "cutoff": cutoff.isoformat(),
                "keep_days": keep_days,
                "duration_seconds": time.perf_counter() - started_at,
                "trigger": "cron",
            },
        )
        conn.commit()
        return jsonify({"error": "Cleanup failed.", "detail": str(exc)}), 500
    finally:
        cursor.close()
