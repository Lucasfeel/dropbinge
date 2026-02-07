from services.email_templates import build_email_message
from database import get_cursor
import config


def requeue_stale_sending(conn, *, channel, stale_minutes):
    cursor = get_cursor(conn)
    cursor.execute(
        """
        UPDATE notification_outbox
        SET status = 'pending',
            locked_at = NULL
        WHERE channel = %s
          AND status = 'sending'
          AND locked_at IS NOT NULL
          AND locked_at < NOW() - (%s * INTERVAL '1 minute');
        """,
        (channel, stale_minutes),
    )
    updated = cursor.rowcount
    conn.commit()
    cursor.close()
    return updated


def claim_pending_batch(conn, *, channel, batch_size):
    cursor = get_cursor(conn)
    cursor.execute(
        """
        WITH picked AS (
            SELECT o.id
            FROM notification_outbox o
            WHERE o.channel = %s
              AND o.status = 'pending'
              AND (o.next_attempt_at IS NULL OR o.next_attempt_at <= NOW())
            ORDER BY o.created_at ASC
            FOR UPDATE SKIP LOCKED
            LIMIT %s
        )
        UPDATE notification_outbox o
        SET status = 'sending',
            locked_at = NOW(),
            attempt_count = o.attempt_count + 1,
            last_attempt_at = NOW()
        FROM picked p, users u
        WHERE o.id = p.id AND u.id = o.user_id
        RETURNING o.id, o.user_id, u.email AS to_email, o.payload, o.attempt_count;
        """,
        (channel, batch_size),
    )
    rows = cursor.fetchall()
    conn.commit()
    cursor.close()
    return rows


def mark_sent(conn, outbox_id):
    cursor = get_cursor(conn)
    cursor.execute(
        """
        UPDATE notification_outbox
        SET status = 'sent',
            sent_at = NOW(),
            locked_at = NULL,
            last_error = NULL
        WHERE id = %s;
        """,
        (outbox_id,),
    )
    conn.commit()
    cursor.close()


def mark_failed_or_retry(
    conn,
    outbox_id,
    *,
    attempt_count,
    error,
    max_attempts,
    backoff_base,
    backoff_max,
):
    safe_error = (error or "")[:2000]
    if attempt_count >= max_attempts:
        status = "failed"
        next_attempt_at = None
    else:
        status = "pending"
        backoff_seconds = min(backoff_base * (2 ** (attempt_count - 1)), backoff_max)
        next_attempt_at = f"{backoff_seconds} seconds"

    cursor = get_cursor(conn)
    if next_attempt_at is None:
        cursor.execute(
            """
            UPDATE notification_outbox
            SET status = %s,
                locked_at = NULL,
                last_error = %s,
                next_attempt_at = NULL
            WHERE id = %s;
            """,
            (status, safe_error, outbox_id),
        )
    else:
        cursor.execute(
            """
            UPDATE notification_outbox
            SET status = %s,
                locked_at = NULL,
                last_error = %s,
                next_attempt_at = NOW() + %s::INTERVAL
            WHERE id = %s;
            """,
            (status, safe_error, next_attempt_at, outbox_id),
        )
    conn.commit()
    cursor.close()


def dispatch_email_outbox_once(
    conn,
    *,
    provider,
    app_base_url,
    batch_size,
    max_attempts,
    stale_minutes,
    backoff_base,
    backoff_max,
    dry_run=False,
):
    stale_requeued = requeue_stale_sending(conn, channel="email", stale_minutes=stale_minutes)
    claimed_rows = claim_pending_batch(conn, channel="email", batch_size=batch_size)
    sent = 0
    retried = 0
    failed = 0

    for row in claimed_rows:
        outbox_id = row["id"]
        attempt_count = row["attempt_count"]
        try:
            message = build_email_message(row["payload"], app_base_url=app_base_url)
            if not dry_run:
                provider.send_email(
                    to_email=row["to_email"],
                    subject=message["subject"],
                    text=message["text"],
                    html=message["html"],
                    reply_to=config.EMAIL_REPLY_TO,
                )
            mark_sent(conn, outbox_id)
            sent += 1
        except Exception as exc:
            mark_failed_or_retry(
                conn,
                outbox_id,
                attempt_count=attempt_count,
                error=str(exc),
                max_attempts=max_attempts,
                backoff_base=backoff_base,
                backoff_max=backoff_max,
            )
            if attempt_count >= max_attempts:
                failed += 1
            else:
                retried += 1

    return {
        "claimed": len(claimed_rows),
        "sent": sent,
        "retried": retried,
        "failed": failed,
        "stale_requeued": stale_requeued,
    }
