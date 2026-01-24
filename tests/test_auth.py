def test_auth_register_login_me(client):
    register_resp = client.post(
        "/api/auth/register",
        json={"email": "user@example.com", "password": "password123"},
    )
    assert register_resp.status_code == 200
    token = register_resp.get_json()["token"]

    login_resp = client.post(
        "/api/auth/login",
        json={"email": "user@example.com", "password": "password123"},
    )
    assert login_resp.status_code == 200
    login_token = login_resp.get_json()["token"]
    assert login_token

    me_resp = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me_resp.status_code == 200
    assert me_resp.get_json()["user"]["email"] == "user@example.com"
