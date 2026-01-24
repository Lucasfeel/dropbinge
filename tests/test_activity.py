import datetime

from psycopg2.extras import Json

from database import get_cursor


def _register(client, email):
    resp = client.post(
        "/api/auth/register",
        json={"email": email, "password": "password123"},
    )
    return resp.get_json()["token"]


def _get_user_id(db_conn, email):
    cursor = get_cursor(db_conn)
    cursor.execute("SELECT id FROM users WHERE email = %s;", (email,))
    return cursor.fetchone()["id"]


def test_activity_requires_auth(client):
    response = client.get("/api/my/activity")
    assert response.status_code == 401


def test_activity_user_isolation_and_counts(client, db_conn):
    token = _register(client, "activity1@example.com")
    _register(client, "activity2@example.com")

    user1_id = _get_user_id(db_conn, "activity1@example.com")
    user2_id = _get_user_id(db_conn, "activity2@example.com")

    cursor = get_cursor(db_conn)
    cursor.execute(
        """
        INSERT INTO follows (user_id, target_type, tmdb_id, season_number)
        VALUES (%s, %s, %s, %s)
        RETURNING id;
        """,
        (user1_id, "movie", 550, None),
    )
    follow_id = cursor.fetchone()["id"]

    cursor.execute(
        """
        INSERT INTO change_events (user_id, follow_id, event_type, event_payload)
        VALUES (%s, %s, %s, %s);
        """,
        (user1_id, follow_id, "date_set", Json({"from": None, "to": "2024-01-01"})),
    )
    cursor.execute(
        """
        INSERT INTO notification_outbox (user_id, follow_id, channel, payload, status)
        VALUES (%s, %s, %s, %s, %s);
        """,
        (user1_id, follow_id, "email", Json({"event_type": "date_set"}), "pending"),
    )
    cursor.execute(
        """
        INSERT INTO notification_outbox (user_id, follow_id, channel, payload, status)
        VALUES (%s, %s, %s, %s, %s);
        """,
        (user2_id, follow_id, "email", Json({"event_type": "date_set"}), "pending"),
    )
    db_conn.commit()

    response = client.get("/api/my/activity", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200
    payload = response.get_json()
    assert len(payload["recent_events"]) == 1
    assert payload["recent_events"][0]["follow_id"] == follow_id
    assert len(payload["outbox"]) == 1
    assert payload["outbox"][0]["follow_id"] == follow_id
    assert payload["meta"]["counts"]["outbox_pending"] == 1


def test_activity_orders_recent_events_newest_first(client, db_conn):
    token = _register(client, "activity-order@example.com")
    user_id = _get_user_id(db_conn, "activity-order@example.com")

    cursor = get_cursor(db_conn)
    cursor.execute(
        """
        INSERT INTO follows (user_id, target_type, tmdb_id, season_number)
        VALUES (%s, %s, %s, %s)
        RETURNING id;
        """,
        (user_id, "tv_full", 999, None),
    )
    follow_id = cursor.fetchone()["id"]

    older = datetime.datetime(2023, 1, 1, 10, 0, 0)
    newer = datetime.datetime(2023, 1, 2, 10, 0, 0)
    cursor.execute(
        """
        INSERT INTO change_events (user_id, follow_id, event_type, event_payload, created_at)
        VALUES (%s, %s, %s, %s, %s)
        RETURNING id;
        """,
        (user_id, follow_id, "date_set", Json({"from": None, "to": "2023-01-01"}), older),
    )
    cursor.execute(
        """
        INSERT INTO change_events (user_id, follow_id, event_type, event_payload, created_at)
        VALUES (%s, %s, %s, %s, %s)
        RETURNING id;
        """,
        (user_id, follow_id, "date_changed", Json({"from": "2023-01-01", "to": "2023-01-02"}), newer),
    )
    db_conn.commit()

    response = client.get("/api/my/activity", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200
    events = response.get_json()["recent_events"]
    assert len(events) == 2
    assert events[0]["event_type"] == "date_changed"
