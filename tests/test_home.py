import datetime

from psycopg2.extras import Json

from database import create_standalone_connection, get_cursor


def _register(client):
    resp = client.post(
        "/api/auth/register",
        json={"email": "home@example.com", "password": "password123"},
    )
    data = resp.get_json()
    return data["token"], data["user"]["id"]


def test_upcoming_drops_ordering(client):
    token, user_id = _register(client)
    headers = {"Authorization": f"Bearer {token}"}

    client.post("/api/my/follows", headers=headers, json={"target_type": "movie", "tmdb_id": 1})
    client.post("/api/my/follows", headers=headers, json={"target_type": "movie", "tmdb_id": 2})
    client.post(
        "/api/my/follows",
        headers=headers,
        json={"target_type": "tv_season", "tmdb_id": 10, "season_number": 1},
    )

    conn = create_standalone_connection()
    cursor = get_cursor(conn)
    today = datetime.date.today()
    base_time = datetime.datetime(2030, 1, 1, 12, 0, 0)

    cursor.execute(
        """
        INSERT INTO tmdb_cache (
            media_type, tmdb_id, season_number, payload, status_raw, release_date, updated_at
        ) VALUES (%s, %s, %s, %s, %s, %s, %s);
        """,
        (
            "movie",
            1,
            -1,
            Json({"id": 1, "title": "Movie 1"}),
            None,
            today + datetime.timedelta(days=10),
            base_time,
        ),
    )
    cursor.execute(
        """
        INSERT INTO tmdb_cache (
            media_type, tmdb_id, season_number, payload, status_raw, release_date, updated_at
        ) VALUES (%s, %s, %s, %s, %s, %s, %s);
        """,
        (
            "movie",
            2,
            -1,
            Json({"id": 2, "title": "Movie 2"}),
            None,
            today + datetime.timedelta(days=2),
            base_time + datetime.timedelta(hours=2),
        ),
    )
    cursor.execute(
        """
        INSERT INTO tmdb_cache (
            media_type, tmdb_id, season_number, payload, status_raw, season_air_date, updated_at
        ) VALUES (%s, %s, %s, %s, %s, %s, %s);
        """,
        (
            "season",
            10,
            1,
            Json({"id": 10, "name": "Season 1"}),
            None,
            today + datetime.timedelta(days=5),
            base_time + datetime.timedelta(hours=1),
        ),
    )
    conn.commit()

    resp = client.get("/api/my/home", headers=headers)
    assert resp.status_code == 200
    data = resp.get_json()
    upcoming_ids = [item["tmdb_id"] for item in data["upcoming_drops"]]
    assert upcoming_ids == [2, 10, 1]

    cursor.close()
    conn.close()


def test_tbd_updates_excludes_concluded_tv_full(client):
    token, user_id = _register(client)
    headers = {"Authorization": f"Bearer {token}"}

    client.post("/api/my/follows", headers=headers, json={"target_type": "tv_full", "tmdb_id": 99})

    conn = create_standalone_connection()
    cursor = get_cursor(conn)
    cursor.execute(
        """
        INSERT INTO tmdb_cache (
            media_type, tmdb_id, season_number, payload, status_raw, next_air_date, updated_at
        ) VALUES (%s, %s, %s, %s, %s, %s, %s);
        """,
        ("tv", 99, -1, Json({"id": 99, "name": "Done Show"}), "Ended", None, datetime.datetime.utcnow()),
    )
    conn.commit()

    resp = client.get("/api/my/home", headers=headers)
    assert resp.status_code == 200
    data = resp.get_json()
    assert not any(item["tmdb_id"] == 99 for item in data["tbd_updates"])

    cursor.close()
    conn.close()


def test_tbd_updates_never_refreshed_last(client):
    token, user_id = _register(client)
    headers = {"Authorization": f"Bearer {token}"}

    client.post("/api/my/follows", headers=headers, json={"target_type": "movie", "tmdb_id": 123})
    client.post("/api/my/follows", headers=headers, json={"target_type": "movie", "tmdb_id": 124})

    conn = create_standalone_connection()
    cursor = get_cursor(conn)
    cursor.execute(
        """
        INSERT INTO tmdb_cache (
            media_type, tmdb_id, season_number, payload, status_raw, release_date, updated_at
        ) VALUES (%s, %s, %s, %s, %s, %s, %s);
        """,
        ("movie", 124, -1, Json({"id": 124, "title": "TBD Movie"}), None, None, datetime.datetime.utcnow()),
    )
    conn.commit()

    resp = client.get("/api/my/home", headers=headers)
    assert resp.status_code == 200
    data = resp.get_json()
    assert data["tbd_updates"][0]["tmdb_id"] == 124
    assert data["tbd_updates"][-1]["tmdb_id"] == 123
    assert data["meta"]["counts"]["tbd_needs_refresh"] == 1
    assert data["tbd_needs_refresh_count"] == 1

    cursor.close()
    conn.close()


def test_recent_completes_newest_first(client):
    token, user_id = _register(client)
    headers = {"Authorization": f"Bearer {token}"}

    tv_full_resp = client.post(
        "/api/my/follows",
        headers=headers,
        json={"target_type": "tv_full", "tmdb_id": 201},
    )
    tv_season_resp = client.post(
        "/api/my/follows",
        headers=headers,
        json={"target_type": "tv_season", "tmdb_id": 202, "season_number": 1},
    )
    tv_full_id = tv_full_resp.get_json()["id"]
    tv_season_id = tv_season_resp.get_json()["id"]

    conn = create_standalone_connection()
    cursor = get_cursor(conn)
    older_time = datetime.datetime(2030, 1, 1, 10, 0, 0)
    newer_time = datetime.datetime(2030, 1, 2, 10, 0, 0)

    cursor.execute(
        """
        INSERT INTO change_events (user_id, follow_id, event_type, event_payload, created_at)
        VALUES (%s, %s, %s, %s, %s);
        """,
        (user_id, tv_full_id, "full_run_concluded", Json({"from": "Running", "to": "Ended"}), older_time),
    )
    cursor.execute(
        """
        INSERT INTO change_events (user_id, follow_id, event_type, event_payload, created_at)
        VALUES (%s, %s, %s, %s, %s);
        """,
        (
            user_id,
            tv_season_id,
            "season_binge_ready",
            Json({"last_episode_air_date": "2030-01-02"}),
            newer_time,
        ),
    )
    conn.commit()

    resp = client.get("/api/my/home", headers=headers)
    assert resp.status_code == 200
    data = resp.get_json()
    assert data["recent_completes"][0]["event_type"] == "season_binge_ready"
    assert "event_summary" in data["recent_completes"][0]

    cursor.close()
    conn.close()
