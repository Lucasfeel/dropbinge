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
