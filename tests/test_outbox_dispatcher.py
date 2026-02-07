from psycopg2.extras import Json

from database import get_cursor
from services.outbox_dispatcher import (
    claim_pending_batch,
    dispatch_email_outbox_once,
    mark_failed_or_retry,
)


class FakeProvider:
    def __init__(self, *, should_fail=False):
        self.sent = []
        self.should_fail = should_fail

    def send_email(self, *, to_email, subject, text, html=None, reply_to=None):
        if self.should_fail:
            raise RuntimeError("SMTP failure")
        self.sent.append(
            {"to_email": to_email, "subject": subject, "text": text, "html": html, "reply_to": reply_to}
        )


def _insert_user_follow_event(cursor, *, email):
    cursor.execute(
        "INSERT INTO users (email, password_hash) VALUES (%s, %s) RETURNING id;",
        (email, "hash"),
    )
    user_id = cursor.fetchone()["id"]
    cursor.execute(
        """
        INSERT INTO follows (user_id, target_type, tmdb_id, season_number)
        VALUES (%s, %s, %s, %s)
        RETURNING id;
        """,
        (user_id, "movie", 101, None),
    )
    follow_id = cursor.fetchone()["id"]
    cursor.execute(
        """
        INSERT INTO change_events (user_id, follow_id, event_type, event_payload)
        VALUES (%s, %s, %s, %s)
        RETURNING id;
        """,
        (user_id, follow_id, "date_set", Json({"from": None, "to": "2030-01-01"})),
    )
    change_event_id = cursor.fetchone()["id"]
    return user_id, follow_id, change_event_id


def test_dispatch_email_outbox_success(db_conn):
    cursor = get_cursor(db_conn)
    user_id, follow_id, change_event_id = _insert_user_follow_event(
        cursor, email="dispatch@example.com"
    )
    cursor.execute(
        """
        INSERT INTO notification_outbox (
            user_id,
            follow_id,
            change_event_id,
            channel,
            payload,
            status
        )
        VALUES (%s, %s, %s, %s, %s, %s);
        """,
        (
            user_id,
            follow_id,
            change_event_id,
            "email",
            Json(
                {
                    "event_type": "date_set",
                    "event_payload": {"from": None, "to": "2030-01-01"},
                    "target_type": "movie",
                    "tmdb_id": 101,
                    "season_number": None,
                    "title": "Dispatch Movie",
                }
            ),
            "pending",
        ),
    )
    db_conn.commit()

    provider = FakeProvider()
    result = dispatch_email_outbox_once(
        db_conn,
        provider=provider,
        app_base_url=None,
        batch_size=10,
        max_attempts=3,
        stale_minutes=15,
        backoff_base=60,
        backoff_max=3600,
        dry_run=False,
    )

    assert result["sent"] == 1
    assert provider.sent
    assert "[DropBinge]" in provider.sent[0]["subject"]

    cursor.execute("SELECT status, sent_at FROM notification_outbox WHERE user_id = %s;", (user_id,))
    row = cursor.fetchone()
    assert row["status"] == "sent"
    assert row["sent_at"] is not None


def test_dispatch_email_outbox_retry(db_conn):
    cursor = get_cursor(db_conn)
    user_id, follow_id, change_event_id = _insert_user_follow_event(
        cursor, email="retry@example.com"
    )
    cursor.execute(
        """
        INSERT INTO notification_outbox (
            user_id,
            follow_id,
            change_event_id,
            channel,
            payload,
            status
        )
        VALUES (%s, %s, %s, %s, %s, %s);
        """,
        (
            user_id,
            follow_id,
            change_event_id,
            "email",
            Json(
                {
                    "event_type": "date_changed",
                    "event_payload": {"from": "2029-01-01", "to": "2029-02-02"},
                    "target_type": "movie",
                    "tmdb_id": 202,
                    "season_number": None,
                    "title": "Retry Movie",
                }
            ),
            "pending",
        ),
    )
    db_conn.commit()

    provider = FakeProvider(should_fail=True)
    result = dispatch_email_outbox_once(
        db_conn,
        provider=provider,
        app_base_url=None,
        batch_size=10,
        max_attempts=3,
        stale_minutes=15,
        backoff_base=60,
        backoff_max=3600,
        dry_run=False,
    )

    assert result["retried"] == 1
    cursor.execute(
        "SELECT status, next_attempt_at, last_error FROM notification_outbox WHERE user_id = %s;",
        (user_id,),
    )
    row = cursor.fetchone()
    assert row["status"] == "pending"
    assert row["next_attempt_at"] is not None
    assert row["last_error"]


def test_claim_pending_batch_respects_limit(db_conn):
    cursor = get_cursor(db_conn)
    user_id, follow_id, change_event_id = _insert_user_follow_event(
        cursor, email="batch@example.com"
    )
    payload = {
        "event_type": "date_set",
        "event_payload": {"from": None, "to": "2030-01-01"},
        "target_type": "movie",
        "tmdb_id": 303,
        "season_number": None,
        "title": "Batch Movie",
    }
    for _ in range(2):
        cursor.execute(
            """
            INSERT INTO notification_outbox (
                user_id,
                follow_id,
                change_event_id,
                channel,
                payload,
                status
            )
            VALUES (%s, %s, %s, %s, %s, %s);
            """,
            (user_id, follow_id, change_event_id, "email", Json(payload), "pending"),
        )
    db_conn.commit()

    rows = claim_pending_batch(db_conn, channel="email", batch_size=1)
    assert len(rows) == 1


def test_mark_failed_or_retry_marks_failed(db_conn):
    cursor = get_cursor(db_conn)
    cursor.execute(
        """
        INSERT INTO users (email, password_hash)
        VALUES (%s, %s)
        RETURNING id;
        """,
        ("fail@example.com", "hash"),
    )
    user_id = cursor.fetchone()["id"]
    cursor.execute(
        """
        INSERT INTO notification_outbox (
            user_id,
            follow_id,
            channel,
            payload,
            status
        )
        VALUES (%s, %s, %s, %s, %s)
        RETURNING id;
        """,
        (
            user_id,
            1,
            "email",
            Json(
                {
                    "event_type": "status_milestone",
                    "event_payload": {"from": "Planned", "to": "In Production"},
                    "target_type": "movie",
                    "tmdb_id": 404,
                    "season_number": None,
                    "title": "Failed Movie",
                }
            ),
            "sending",
        ),
    )
    outbox_id = cursor.fetchone()["id"]
    db_conn.commit()

    mark_failed_or_retry(
        db_conn,
        outbox_id,
        attempt_count=3,
        error="Boom",
        max_attempts=3,
        backoff_base=60,
        backoff_max=3600,
    )

    cursor.execute(
        "SELECT status, next_attempt_at, last_error FROM notification_outbox WHERE id = %s;",
        (outbox_id,),
    )
    row = cursor.fetchone()
    assert row["status"] == "failed"
    assert row["next_attempt_at"] is None
    assert row["last_error"] == "Boom"
