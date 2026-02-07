from database import managed_cursor
from services.refresh_service import refresh_follow


def refresh_all_follows(
    conn,
    *,
    limit_users=None,
    limit_follows=None,
    force_fetch=False,
):
    with managed_cursor(conn) as cursor:
        user_ids = None
        if limit_users:
            cursor.execute("SELECT id FROM users ORDER BY id ASC LIMIT %s;", (limit_users,))
            user_ids = [row["id"] for row in cursor.fetchall()]
            if not user_ids:
                return {"processed_follows": 0, "events_emitted": 0, "outbox_enqueued": 0}

        query = """
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
        """
        params = []
        if user_ids is not None:
            query += " WHERE f.user_id = ANY(%s)"
            params.append(user_ids)
        query += " ORDER BY f.id ASC"
        if limit_follows:
            query += " LIMIT %s"
            params.append(limit_follows)

        cursor.execute(query, tuple(params))
        follows = cursor.fetchall()

        cursor.execute("SELECT COUNT(*) AS count FROM notification_outbox;")
        outbox_before = cursor.fetchone()["count"]

    events_emitted = 0
    for follow in follows:
        events_emitted += len(
            refresh_follow(conn, follow, None, follow, force_fetch=force_fetch, emit_events=True)
        )

    with managed_cursor(conn) as cursor:
        cursor.execute("SELECT COUNT(*) AS count FROM notification_outbox;")
        outbox_after = cursor.fetchone()["count"]

    return {
        "processed_follows": len(follows),
        "events_emitted": events_emitted,
        "outbox_enqueued": max(outbox_after - outbox_before, 0),
    }
