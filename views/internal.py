from flask import Blueprint, jsonify, request

import config
from database import get_db
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


@internal_bp.post("/dispatch-email")
def dispatch_email():
    auth_error = _validate_cron_secret(request)
    if auth_error:
        return jsonify(auth_error[0]), auth_error[1]

    provider = build_email_provider_from_config()
    if provider is None and not config.EMAIL_DISPATCH_DRY_RUN:
        return jsonify({"error": "EMAIL not enabled."}), 503

    conn = get_db()
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
    return jsonify({"ok": True, "summary": summary})


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

    conn = get_db()
    summary = refresh_all_follows(
        conn,
        limit_users=limit_users,
        limit_follows=limit_follows,
        force_fetch=False,
    )
    return jsonify({"ok": True, "summary": summary})
