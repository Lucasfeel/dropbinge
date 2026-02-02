from psycopg2.extras import Json

from database import create_standalone_connection, get_cursor
from services.refresh_service import refresh_follow


def _register(client):
    resp = client.post(
        "/api/auth/register",
        json={"email": "refresh@example.com", "password": "password123"},
    )
    return resp.get_json()["token"], resp.get_json()["user"]["id"]


def test_refresh_emits_date_set_event(client, monkeypatch):
    token, user_id = _register(client)

    create_resp = client.post(
        "/api/my/follows",
        headers={"Authorization": f"Bearer {token}"},
        json={"target_type": "movie", "tmdb_id": 555},
    )
    follow_id = create_resp.get_json()["id"]

    conn = create_standalone_connection()
    cursor = get_cursor(conn)
    cursor.execute(
        """
        INSERT INTO tmdb_cache (
            media_type, tmdb_id, season_number, payload, status_raw, release_date
        ) VALUES (%s, %s, %s, %s, %s, %s);
        """,
        ("movie", 555, -1, Json({"id": 555, "title": "Test Movie"}), None, None),
    )
    conn.commit()

    def fake_movie_details(movie_id):
        return {"id": movie_id, "title": "Test Movie", "release_date": "2030-01-01"}

    monkeypatch.setattr("services.refresh_service.tmdb_client.get_movie_details", fake_movie_details)

    refresh_resp = client.post(
        "/api/my/refresh",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert refresh_resp.status_code == 200

    cursor.execute(
        "SELECT event_type FROM change_events WHERE user_id = %s AND follow_id = %s;",
        (user_id, follow_id),
    )
    events = cursor.fetchall()
    assert any(event["event_type"] == "date_set" for event in events)

    cursor.execute(
        "SELECT channel FROM notification_outbox WHERE user_id = %s AND follow_id = %s;",
        (user_id, follow_id),
    )
    outbox = cursor.fetchall()
    assert any(row["channel"] == "email" for row in outbox)

    cursor.close()
    conn.close()


def test_refresh_respects_notify_date_changes(client, monkeypatch):
    token, user_id = _register(client)

    create_resp = client.post(
        "/api/my/follows",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "target_type": "movie",
            "tmdb_id": 777,
            "prefs": {"notify_date_changes": False},
        },
    )
    follow_id = create_resp.get_json()["id"]

    conn = create_standalone_connection()
    cursor = get_cursor(conn)
    cursor.execute(
        """
        INSERT INTO tmdb_cache (
            media_type, tmdb_id, season_number, payload, status_raw, release_date
        ) VALUES (%s, %s, %s, %s, %s, %s);
        """,
        ("movie", 777, -1, Json({"id": 777, "title": "Muted Movie"}), None, None),
    )
    conn.commit()

    def fake_movie_details(movie_id):
        return {"id": movie_id, "title": "Muted Movie", "release_date": "2031-02-02"}

    monkeypatch.setattr("services.refresh_service.tmdb_client.get_movie_details", fake_movie_details)

    refresh_resp = client.post(
        "/api/my/refresh",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert refresh_resp.status_code == 200

    cursor.execute(
        "SELECT release_date FROM tmdb_cache WHERE media_type = %s AND tmdb_id = %s AND season_number = %s;",
        ("movie", 777, -1),
    )
    cache_row = cursor.fetchone()
    assert cache_row["release_date"].isoformat() == "2031-02-02"

    cursor.execute(
        "SELECT event_type FROM change_events WHERE user_id = %s AND follow_id = %s;",
        (user_id, follow_id),
    )
    events = cursor.fetchall()
    assert not any(event["event_type"] in ("date_set", "date_changed") for event in events)

    cursor.execute(
        "SELECT channel FROM notification_outbox WHERE user_id = %s AND follow_id = %s;",
        (user_id, follow_id),
    )
    outbox = cursor.fetchall()
    assert outbox == []

    cursor.close()
    conn.close()


def test_refresh_follow_uses_tracking_cache(monkeypatch):
    conn = create_standalone_connection()
    cursor = get_cursor(conn)
    cursor.execute(
        """
        INSERT INTO tmdb_cache (
            media_type,
            tmdb_id,
            season_number,
            payload,
            status_raw,
            release_date,
            fetched_at,
            expires_at
        ) VALUES (%s, %s, %s, %s, %s, %s, NOW(), NOW() + INTERVAL '1 hour');
        """,
        ("movie", 999, -1, Json({"id": 999, "title": "Cached Movie"}), "Released", None),
    )
    conn.commit()

    def fail_movie_details(movie_id):
        raise AssertionError("TMDB should not be called when cache is fresh.")

    monkeypatch.setattr("services.refresh_service.tmdb_client.get_movie_details", fail_movie_details)

    follow = {"id": 1, "user_id": 1, "target_type": "movie", "tmdb_id": 999, "season_number": None}
    prefs = {"notify_date_changes": True}
    events = refresh_follow(conn, follow, None, prefs, force_fetch=False, emit_events=False)
    assert events == []

    cursor.close()
    conn.close()


def test_refresh_follow_expired_cache_calls_upstream(monkeypatch):
    conn = create_standalone_connection()
    cursor = get_cursor(conn)
    cursor.execute(
        """
        INSERT INTO tmdb_cache (
            media_type,
            tmdb_id,
            season_number,
            payload,
            status_raw,
            release_date,
            fetched_at,
            expires_at
        ) VALUES (%s, %s, %s, %s, %s, %s, NOW(), NOW() - INTERVAL '1 hour');
        """,
        ("movie", 1001, -1, Json({"id": 1001, "title": "Expired Movie"}), "Released", None),
    )
    conn.commit()

    calls = {"count": 0}

    def fake_movie_details(movie_id):
        calls["count"] += 1
        return {"id": movie_id, "title": "Fresh Movie", "release_date": "2033-01-01"}

    monkeypatch.setattr("services.refresh_service.tmdb_client.get_movie_details", fake_movie_details)

    follow = {"id": 1, "user_id": 1, "target_type": "movie", "tmdb_id": 1001, "season_number": None}
    prefs = {"notify_date_changes": True}
    events = refresh_follow(conn, follow, None, prefs, force_fetch=False, emit_events=False)
    assert events == []
    assert calls["count"] == 1

    cursor.close()
    conn.close()
