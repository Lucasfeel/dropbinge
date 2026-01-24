from flask import Blueprint, jsonify

from database import get_db, get_cursor
from services.refresh_service import refresh_follow
from utils.auth import require_auth

refresh_bp = Blueprint("refresh", __name__, url_prefix="/api/my")


@refresh_bp.post("/refresh")
@require_auth
def refresh_all(payload):
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
        WHERE f.user_id = %s;
        """,
        (user_id,),
    )
    follows = cursor.fetchall()
    events = []
    for follow in follows:
        events.extend(refresh_follow(db, follow, follow))
    return jsonify({"refreshed": len(follows), "events": events})
