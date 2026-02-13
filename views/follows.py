import psycopg2

from flask import Blueprint, jsonify, request

from database import get_db, get_cursor
from services.refresh_service import refresh_follow
from utils.auth import require_auth

follows_bp = Blueprint("follows", __name__, url_prefix="/api/my/follows")

PREF_FIELDS = {
    "notify_date_changes",
    "notify_status_milestones",
    "notify_season_binge_ready",
    "notify_episode_drops",
    "notify_full_run_concluded",
    "channel_email",
    "channel_whatsapp",
    "frequency",
}

BOOL_PREF_FIELDS = {
    "notify_date_changes",
    "notify_status_milestones",
    "notify_season_binge_ready",
    "notify_episode_drops",
    "notify_full_run_concluded",
    "channel_email",
    "channel_whatsapp",
}

ALLOWED_TARGET_TYPES = {"movie", "tv_full", "tv_season"}
ALLOWED_FREQUENCIES = {"important_only", "all_updates"}

DEFAULT_PREFS = {
    "notify_date_changes": True,
    "notify_status_milestones": False,
    "notify_season_binge_ready": True,
    "notify_episode_drops": False,
    "notify_full_run_concluded": True,
    "channel_email": True,
    "channel_whatsapp": False,
    "frequency": "important_only",
}


def _validate_bool(value, field_name):
    if not isinstance(value, bool):
        return jsonify({"error": "invalid_boolean", "field": field_name}), 400
    return None


def _validate_tmdb_id(value):
    if isinstance(value, bool) or not isinstance(value, int) or value <= 0:
        return jsonify({"error": "invalid_tmdb_id"}), 400
    return None


def _validate_season_number(value):
    if isinstance(value, bool) or not isinstance(value, int) or value < 0:
        return jsonify({"error": "invalid_season_number"}), 400
    return None


def _validate_prefs(raw, partial=False):
    if raw is None:
        raw = {}
    if not isinstance(raw, dict):
        return None, (jsonify({"error": "invalid_prefs"}), 400)
    prefs = {} if partial else DEFAULT_PREFS.copy()
    for key in PREF_FIELDS:
        if key not in raw:
            continue
        value = raw[key]
        if key in BOOL_PREF_FIELDS:
            error = _validate_bool(value, key)
            if error:
                return None, error
        if key == "frequency" and value not in ALLOWED_FREQUENCIES:
            return None, (jsonify({"error": "invalid_frequency"}), 400)
        prefs[key] = value
    return prefs, None


@follows_bp.get("")
@require_auth
def list_follows(payload):
    user_id = int(payload["sub"])
    db = get_db()
    cursor = get_cursor(db)
    cursor.execute(
        """
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
            p.updated_at,
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
        LEFT JOIN tmdb_cache c ON (
            (f.target_type = 'movie' AND c.media_type = 'movie' AND c.tmdb_id = f.tmdb_id AND c.season_number = -1)
            OR (f.target_type = 'tv_full' AND c.media_type = 'tv' AND c.tmdb_id = f.tmdb_id AND c.season_number = -1)
            OR (f.target_type = 'tv_season' AND c.media_type = 'season' AND c.tmdb_id = f.tmdb_id AND c.season_number = f.season_number)
        )
        WHERE f.user_id = %s
        ORDER BY f.created_at DESC;
        """,
        (user_id,),
    )
    rows = cursor.fetchall()
    return jsonify({"follows": rows})


@follows_bp.post("")
@require_auth
def create_follow(payload):
    user_id = int(payload["sub"])
    data = request.get_json() or {}
    target_type = data.get("target_type")
    tmdb_id = data.get("tmdb_id")
    season_number = data.get("season_number")
    if target_type not in ALLOWED_TARGET_TYPES:
        return jsonify({"error": "invalid_target_type"}), 400
    if tmdb_id is None:
        return jsonify({"error": "tmdb_id required"}), 400
    tmdb_error = _validate_tmdb_id(tmdb_id)
    if tmdb_error:
        return tmdb_error
    if target_type == "tv_season" and season_number is None:
        return jsonify({"error": "season_number required"}), 400
    if target_type == "tv_season":
        season_error = _validate_season_number(season_number)
        if season_error:
            return season_error

    if target_type != "tv_season":
        season_number = None

    prefs, error = _validate_prefs(data.get("prefs"), partial=False)
    if error:
        return error

    db = get_db()
    cursor = get_cursor(db)
    try:
        cursor.execute(
            """
            INSERT INTO follows (user_id, target_type, tmdb_id, season_number)
            VALUES (%s, %s, %s, %s)
            RETURNING id;
            """,
            (user_id, target_type, tmdb_id, season_number),
        )
        follow_id = cursor.fetchone()["id"]
    except psycopg2.errors.UniqueViolation:
        db.rollback()
        return (
            jsonify(
                {
                    "error": "follow_already_exists",
                    "message": "Follow already exists for this target.",
                }
            ),
            409,
        )
    cursor.execute(
        """
        INSERT INTO follow_prefs (
            follow_id, notify_date_changes, notify_status_milestones, notify_season_binge_ready,
            notify_episode_drops, notify_full_run_concluded, channel_email, channel_whatsapp, frequency
        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s);
        """,
        (
            follow_id,
            prefs["notify_date_changes"],
            prefs["notify_status_milestones"],
            prefs["notify_season_binge_ready"],
            prefs["notify_episode_drops"],
            prefs["notify_full_run_concluded"],
            prefs["channel_email"],
            prefs["channel_whatsapp"],
            prefs["frequency"],
        ),
    )
    db.commit()
    hydrated = False
    try:
        follow_row = {
            "id": follow_id,
            "user_id": user_id,
            "target_type": target_type,
            "tmdb_id": tmdb_id,
            "season_number": season_number,
        }
        refresh_follow(db, follow_row, None, prefs, force_fetch=True, emit_events=False)
        hydrated = True
    except Exception:
        hydrated = False

    response = {"id": follow_id, "hydrated": hydrated}
    if not hydrated:
        response["warning"] = "hydrate_failed"
    elif prefs.get("channel_whatsapp"):
        response["warning"] = "whatsapp_delivery_not_implemented"
    return jsonify(response), 201


@follows_bp.patch("/<int:follow_id>")
@require_auth
def update_follow(payload, follow_id):
    user_id = int(payload["sub"])
    data = request.get_json() or {}
    updates, error = _validate_prefs(data, partial=True)
    if error:
        return error
    if not updates:
        return jsonify({"error": "No updates provided"}), 400

    set_clauses = ", ".join([f"{key} = %s" for key in updates.keys()])
    values = list(updates.values())
    values.append(follow_id)
    values.append(user_id)

    db = get_db()
    cursor = get_cursor(db)
    cursor.execute(
        f"""
        UPDATE follow_prefs
        SET {set_clauses}, updated_at = NOW()
        WHERE follow_id = %s AND follow_id IN (SELECT id FROM follows WHERE user_id = %s)
        RETURNING follow_id, channel_whatsapp;
        """,
        values,
    )
    row = cursor.fetchone()
    if not row:
        return jsonify({"error": "Follow not found"}), 404
    db.commit()
    response = {"id": row["follow_id"]}
    if row.get("channel_whatsapp"):
        response["warning"] = "whatsapp_delivery_not_implemented"
    return jsonify(response)


@follows_bp.delete("/<int:follow_id>")
@require_auth
def delete_follow(payload, follow_id):
    user_id = int(payload["sub"])
    db = get_db()
    cursor = get_cursor(db)
    cursor.execute(
        "DELETE FROM follows WHERE id = %s AND user_id = %s RETURNING id;",
        (follow_id, user_id),
    )
    row = cursor.fetchone()
    if not row:
        return jsonify({"error": "Follow not found"}), 404
    db.commit()
    return jsonify({"status": "deleted"})
