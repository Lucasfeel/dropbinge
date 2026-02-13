from database import create_standalone_connection, get_cursor


def _register(client):
    resp = client.post(
        "/api/auth/register",
        json={"email": "follow@example.com", "password": "password123"},
    )
    return resp.get_json()["token"]


def test_follow_crud(client):
    token = _register(client)

    create_resp = client.post(
        "/api/my/follows",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "target_type": "movie",
            "tmdb_id": 123,
            "prefs": {"notify_status_milestones": True},
        },
    )
    assert create_resp.status_code == 201
    follow_id = create_resp.get_json()["id"]

    list_resp = client.get("/api/my/follows", headers={"Authorization": f"Bearer {token}"})
    assert list_resp.status_code == 200
    follows = list_resp.get_json()["follows"]
    assert len(follows) == 1
    assert follows[0]["tmdb_id"] == 123

    update_resp = client.patch(
        f"/api/my/follows/{follow_id}",
        headers={"Authorization": f"Bearer {token}"},
        json={"notify_status_milestones": False},
    )
    assert update_resp.status_code == 200

    delete_resp = client.delete(
        f"/api/my/follows/{follow_id}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert delete_resp.status_code == 200


def test_duplicate_follow_returns_conflict(client):
    token = _register(client)
    payload = {"target_type": "movie", "tmdb_id": 222}

    first_resp = client.post(
        "/api/my/follows",
        headers={"Authorization": f"Bearer {token}"},
        json=payload,
    )
    assert first_resp.status_code == 201

    second_resp = client.post(
        "/api/my/follows",
        headers={"Authorization": f"Bearer {token}"},
        json=payload,
    )
    assert second_resp.status_code == 409
    body = second_resp.get_json()
    assert body["error"] == "follow_already_exists"


def test_invalid_frequency_returns_400(client):
    token = _register(client)

    create_resp = client.post(
        "/api/my/follows",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "target_type": "movie",
            "tmdb_id": 333,
            "prefs": {"frequency": "daily"},
        },
    )
    assert create_resp.status_code == 400

    valid_resp = client.post(
        "/api/my/follows",
        headers={"Authorization": f"Bearer {token}"},
        json={"target_type": "movie", "tmdb_id": 334},
    )
    follow_id = valid_resp.get_json()["id"]

    patch_resp = client.patch(
        f"/api/my/follows/{follow_id}",
        headers={"Authorization": f"Bearer {token}"},
        json={"frequency": "weekly"},
    )
    assert patch_resp.status_code == 400


def test_create_follow_rejects_invalid_tmdb_id(client):
    token = _register(client)

    resp = client.post(
        "/api/my/follows",
        headers={"Authorization": f"Bearer {token}"},
        json={"target_type": "movie", "tmdb_id": True},
    )

    assert resp.status_code == 400
    assert resp.get_json()["error"] == "invalid_tmdb_id"


def test_create_follow_hydrates_without_events(client, monkeypatch):
    token = _register(client)

    def fake_movie_details(movie_id):
        return {"id": movie_id, "title": "Hydrated Movie", "release_date": "2032-01-01"}

    monkeypatch.setattr("services.refresh_service.tmdb_client.get_movie_details", fake_movie_details)

    create_resp = client.post(
        "/api/my/follows",
        headers={"Authorization": f"Bearer {token}"},
        json={"target_type": "movie", "tmdb_id": 888},
    )
    assert create_resp.status_code == 201
    body = create_resp.get_json()
    assert body["hydrated"] is True

    conn = create_standalone_connection()
    cursor = get_cursor(conn)
    cursor.execute("SELECT * FROM change_events;")
    assert cursor.fetchall() == []
    cursor.execute("SELECT * FROM notification_outbox;")
    assert cursor.fetchall() == []
    cursor.close()
    conn.close()
