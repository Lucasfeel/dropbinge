from psycopg2.extras import Json

from database import create_standalone_connection, get_cursor


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
