from database import create_standalone_connection, get_cursor


def init_db():
    conn = create_standalone_connection()
    conn.autocommit = True
    cursor = get_cursor(conn)

    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NULL,
            created_at TIMESTAMP NOT NULL DEFAULT NOW()
        );
        """
    )

    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS follows (
            id SERIAL PRIMARY KEY,
            user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            target_type TEXT NOT NULL,
            tmdb_id INT NOT NULL,
            season_number INT NULL,
            created_at TIMESTAMP NOT NULL DEFAULT NOW(),
            UNIQUE(user_id, target_type, tmdb_id, season_number)
        );
        """
    )

    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS follow_prefs (
            follow_id INT PRIMARY KEY REFERENCES follows(id) ON DELETE CASCADE,
            notify_date_changes BOOLEAN NOT NULL DEFAULT TRUE,
            notify_status_milestones BOOLEAN NOT NULL DEFAULT FALSE,
            notify_season_binge_ready BOOLEAN NOT NULL DEFAULT TRUE,
            notify_episode_drops BOOLEAN NOT NULL DEFAULT FALSE,
            notify_full_run_concluded BOOLEAN NOT NULL DEFAULT TRUE,
            channel_email BOOLEAN NOT NULL DEFAULT TRUE,
            channel_whatsapp BOOLEAN NOT NULL DEFAULT FALSE,
            frequency TEXT NOT NULL DEFAULT 'important_only',
            updated_at TIMESTAMP NOT NULL DEFAULT NOW()
        );
        """
    )

    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS tmdb_cache (
            media_type TEXT NOT NULL,
            tmdb_id BIGINT NOT NULL,
            season_number INT NOT NULL DEFAULT -1,
            payload JSONB NOT NULL,
            status_raw TEXT NULL,
            release_date DATE NULL,
            first_air_date DATE NULL,
            last_air_date DATE NULL,
            next_air_date DATE NULL,
            season_air_date DATE NULL,
            season_last_episode_air_date DATE NULL,
            fetched_at TIMESTAMP NOT NULL DEFAULT NOW(),
            expires_at TIMESTAMP NULL,
            updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
            PRIMARY KEY (media_type, tmdb_id, season_number)
        );
        """
    )

    try:
        cursor.execute(
            """
            ALTER TABLE tmdb_cache
            ALTER COLUMN tmdb_id TYPE BIGINT USING tmdb_id::BIGINT;
            """
        )
    except Exception:
        pass

    cursor.execute(
        "ALTER TABLE tmdb_cache ADD COLUMN IF NOT EXISTS fetched_at TIMESTAMP NOT NULL DEFAULT NOW();"
    )
    cursor.execute("ALTER TABLE tmdb_cache ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP NULL;")

    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS change_events (
            id SERIAL PRIMARY KEY,
            user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            follow_id INT NOT NULL REFERENCES follows(id) ON DELETE CASCADE,
            event_type TEXT NOT NULL,
            event_payload JSONB NOT NULL,
            created_at TIMESTAMP NOT NULL DEFAULT NOW()
        );
        """
    )

    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS notification_outbox (
            id SERIAL PRIMARY KEY,
            user_id INT NOT NULL,
            follow_id INT NOT NULL,
            channel TEXT NOT NULL,
            payload JSONB NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            created_at TIMESTAMP NOT NULL DEFAULT NOW(),
            sent_at TIMESTAMP NULL
        );
        """
    )

    cursor.close()
    conn.close()


if __name__ == "__main__":
    init_db()
