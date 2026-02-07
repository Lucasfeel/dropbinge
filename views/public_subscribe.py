from flask import Blueprint, jsonify, request

from database import get_db
from services.public_subscribe_service import LoginRequiredError, subscribe_email

public_subscribe_bp = Blueprint("public_subscribe", __name__, url_prefix="/api/public")

ALLOWED_TARGET_TYPES = {"movie", "tv_full", "tv_season"}


def _validate_roles(roles):
    if not isinstance(roles, dict):
        return None, (jsonify({"error": "invalid_roles"}), 400)
    if "drop" not in roles:
        return None, (jsonify({"error": "drop_required"}), 400)
    if not isinstance(roles.get("drop"), bool):
        return None, (jsonify({"error": "invalid_boolean", "field": "drop"}), 400)
    if "binge" in roles and not isinstance(roles.get("binge"), bool):
        return None, (jsonify({"error": "invalid_boolean", "field": "binge"}), 400)
    return {"drop": roles["drop"], "binge": roles.get("binge", False)}, None


@public_subscribe_bp.post("/subscribe-email")
def subscribe_email_public():
    data = request.get_json() or {}
    email = (data.get("email") or "").strip().lower()
    target_type = data.get("target_type")
    tmdb_id = data.get("tmdb_id")
    season_number = data.get("season_number")

    if not email:
        return jsonify({"error": "email_required"}), 400
    if target_type not in ALLOWED_TARGET_TYPES:
        return jsonify({"error": "invalid_target_type"}), 400
    if not isinstance(tmdb_id, int):
        return jsonify({"error": "tmdb_id required"}), 400
    if target_type == "tv_season":
        if season_number is None:
            return jsonify({"error": "season_number required"}), 400
        if not isinstance(season_number, int) or season_number < 0:
            return jsonify({"error": "invalid_season_number"}), 400
    else:
        season_number = None

    roles, error = _validate_roles(data.get("roles"))
    if error:
        return error

    db = get_db()
    try:
        result = subscribe_email(
            db,
            email=email,
            target_type=target_type,
            tmdb_id=tmdb_id,
            season_number=season_number,
            roles=roles,
        )
    except LoginRequiredError:
        return (
            jsonify(
                {
                    "error": "login_required",
                    "message": "This email already has an account. Please log in.",
                }
            ),
            409,
        )

    return jsonify({"ok": True, "follow_id": result.follow_id})
