from database import get_cursor


def test_public_subscribe_creates_user_and_follow(client, db_conn):
    payload = {
        "email": "guest@example.com",
        "target_type": "tv_season",
        "tmdb_id": 123,
        "season_number": 2,
        "roles": {"drop": True, "binge": False},
    }
    resp = client.post("/api/public/subscribe-email", json=payload)
    assert resp.status_code == 200
    data = resp.get_json()
    assert data["ok"] is True

    cursor = get_cursor(db_conn)
    cursor.execute("SELECT id, password_hash FROM users WHERE email = %s;", ("guest@example.com",))
    user = cursor.fetchone()
    assert user
    assert user["password_hash"] is None

    cursor.execute(
        "SELECT id, user_id FROM follows WHERE user_id = %s AND tmdb_id = %s;",
        (user["id"], 123),
    )
    follow = cursor.fetchone()
    assert follow

    cursor.execute(
        """
        SELECT notify_date_changes, notify_season_binge_ready, notify_full_run_concluded, channel_email
        FROM follow_prefs WHERE follow_id = %s;
        """,
        (follow["id"],),
    )
    prefs = cursor.fetchone()
    assert prefs["notify_date_changes"] is True
    assert prefs["notify_season_binge_ready"] is False
    assert prefs["notify_full_run_concluded"] is False
    assert prefs["channel_email"] is True


def test_public_subscribe_is_idempotent(client, db_conn):
    payload = {
        "email": "repeat@example.com",
        "target_type": "tv_full",
        "tmdb_id": 999,
        "season_number": None,
        "roles": {"drop": True, "binge": False},
    }
    first = client.post("/api/public/subscribe-email", json=payload)
    assert first.status_code == 200
    first_id = first.get_json()["follow_id"]

    payload["roles"] = {"drop": False, "binge": True}
    second = client.post("/api/public/subscribe-email", json=payload)
    assert second.status_code == 200
    second_id = second.get_json()["follow_id"]
    assert first_id == second_id

    cursor = get_cursor(db_conn)
    cursor.execute(
        """
        SELECT notify_date_changes, notify_season_binge_ready, notify_full_run_concluded
        FROM follow_prefs WHERE follow_id = %s;
        """,
        (first_id,),
    )
    prefs = cursor.fetchone()
    assert prefs["notify_date_changes"] is False
    assert prefs["notify_season_binge_ready"] is False
    assert prefs["notify_full_run_concluded"] is True


def test_public_subscribe_requires_login_for_password_users(client):
    register = client.post(
        "/api/auth/register",
        json={"email": "member@example.com", "password": "password123"},
    )
    assert register.status_code == 200

    resp = client.post(
        "/api/public/subscribe-email",
        json={
            "email": "member@example.com",
            "target_type": "movie",
            "tmdb_id": 321,
            "season_number": None,
            "roles": {"drop": True, "binge": False},
        },
    )
    assert resp.status_code == 409
    data = resp.get_json()
    assert data["error"] == "login_required"


def test_register_upgrades_email_only_user(client, db_conn):
    resp = client.post(
        "/api/public/subscribe-email",
        json={
            "email": "upgrade@example.com",
            "target_type": "movie",
            "tmdb_id": 111,
            "season_number": None,
            "roles": {"drop": True, "binge": False},
        },
    )
    assert resp.status_code == 200

    register = client.post(
        "/api/auth/register",
        json={"email": "upgrade@example.com", "password": "newpassword"},
    )
    assert register.status_code == 200

    cursor = get_cursor(db_conn)
    cursor.execute("SELECT password_hash FROM users WHERE email = %s;", ("upgrade@example.com",))
    user = cursor.fetchone()
    assert user
    assert user["password_hash"]


def test_public_subscribe_rejects_invalid_tmdb_id(client):
    resp = client.post(
        "/api/public/subscribe-email",
        json={
            "email": "invalid@example.com",
            "target_type": "movie",
            "tmdb_id": True,
            "roles": {"drop": True, "binge": False},
        },
    )
    assert resp.status_code == 400
    assert resp.get_json()["error"] == "invalid_tmdb_id"
