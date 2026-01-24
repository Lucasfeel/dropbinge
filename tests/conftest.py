import os
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.append(str(ROOT))

import init_db
from app import app as flask_app
from database import create_standalone_connection, get_cursor


@pytest.fixture(scope="session", autouse=True)
def setup_env():
    os.environ.setdefault("JWT_SECRET", "test-secret")


@pytest.fixture(scope="session")
def db_conn():
    if not os.environ.get("DATABASE_URL") and not all(
        os.environ.get(var) for var in ["DB_NAME", "DB_USER", "DB_PASSWORD", "DB_HOST", "DB_PORT"]
    ):
        pytest.skip("Database environment variables not set.")
    init_db.init_db()
    conn = create_standalone_connection()
    yield conn
    conn.close()


@pytest.fixture(autouse=True)
def clean_db(db_conn):
    cursor = get_cursor(db_conn)
    cursor.execute("DELETE FROM notification_outbox;")
    cursor.execute("DELETE FROM change_events;")
    cursor.execute("DELETE FROM follow_prefs;")
    cursor.execute("DELETE FROM follows;")
    cursor.execute("DELETE FROM tmdb_cache;")
    cursor.execute("DELETE FROM users;")
    db_conn.commit()


@pytest.fixture()
def client():
    flask_app.config.update({"TESTING": True})
    with flask_app.test_client() as client:
        yield client
