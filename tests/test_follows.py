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
