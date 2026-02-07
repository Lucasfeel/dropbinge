from __future__ import annotations

from dataclasses import dataclass

from database import get_cursor


class LoginRequiredError(Exception):
    pass


@dataclass(frozen=True)
class SubscribeResult:
    follow_id: int


def build_role_prefs(
    target_type: str,
    roles: dict,
) -> dict:
    binge = roles.get("binge", False)
    if target_type == "movie":
        return {
            "notify_date_changes": roles["drop"],
            "notify_season_binge_ready": False,
            "notify_full_run_concluded": False,
        }
    if target_type == "tv_season":
        return {
            "notify_date_changes": roles["drop"],
            "notify_season_binge_ready": binge,
            "notify_full_run_concluded": False,
        }
    return {
        "notify_date_changes": roles["drop"],
        "notify_season_binge_ready": False,
        "notify_full_run_concluded": binge,
    }


def subscribe_email(
    db,
    *,
    email: str,
    target_type: str,
    tmdb_id: int,
    season_number: int | None,
    roles: dict,
) -> SubscribeResult:
    cursor = get_cursor(db)
    cursor.execute("SELECT id, password_hash FROM users WHERE email = %s;", (email,))
    user = cursor.fetchone()
    if user and user.get("password_hash"):
        raise LoginRequiredError()

    if not user:
        cursor.execute(
            "INSERT INTO users (email, password_hash) VALUES (%s, NULL) RETURNING id;",
            (email,),
        )
        user_id = cursor.fetchone()["id"]
    else:
        user_id = user["id"]

    cursor.execute(
        """
        INSERT INTO follows (user_id, target_type, tmdb_id, season_number)
        VALUES (%s, %s, %s, %s)
        ON CONFLICT (user_id, target_type, tmdb_id, season_number)
        DO UPDATE SET user_id = EXCLUDED.user_id
        RETURNING id;
        """,
        (user_id, target_type, tmdb_id, season_number),
    )
    follow_id = cursor.fetchone()["id"]
    prefs = build_role_prefs(target_type, roles)

    cursor.execute(
        """
        INSERT INTO follow_prefs (
            follow_id,
            notify_date_changes,
            notify_season_binge_ready,
            notify_full_run_concluded,
            channel_email
        ) VALUES (%s, %s, %s, %s, TRUE)
        ON CONFLICT (follow_id)
        DO UPDATE SET
            notify_date_changes = EXCLUDED.notify_date_changes,
            notify_season_binge_ready = EXCLUDED.notify_season_binge_ready,
            notify_full_run_concluded = EXCLUDED.notify_full_run_concluded,
            channel_email = TRUE,
            updated_at = NOW();
        """,
        (
            follow_id,
            prefs["notify_date_changes"],
            prefs["notify_season_binge_ready"],
            prefs["notify_full_run_concluded"],
        ),
    )

    db.commit()
    return SubscribeResult(follow_id=follow_id)
