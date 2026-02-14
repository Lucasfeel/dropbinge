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
            season_count INT NULL,
            episode_count INT NULL,
            last_episode_date DATE NULL,
            next_episode_date DATE NULL,
            final_state TEXT NULL,
            final_completed_at DATE NULL,
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
    cursor.execute("ALTER TABLE tmdb_cache ADD COLUMN IF NOT EXISTS season_count INT NULL;")
    cursor.execute("ALTER TABLE tmdb_cache ADD COLUMN IF NOT EXISTS episode_count INT NULL;")
    cursor.execute("ALTER TABLE tmdb_cache ADD COLUMN IF NOT EXISTS last_episode_date DATE NULL;")
    cursor.execute("ALTER TABLE tmdb_cache ADD COLUMN IF NOT EXISTS next_episode_date DATE NULL;")
    cursor.execute("ALTER TABLE tmdb_cache ADD COLUMN IF NOT EXISTS final_state TEXT NULL;")
    cursor.execute("ALTER TABLE tmdb_cache ADD COLUMN IF NOT EXISTS final_completed_at DATE NULL;")

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
            change_event_id INT NULL,
            channel TEXT NOT NULL,
            payload JSONB NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            created_at TIMESTAMP NOT NULL DEFAULT NOW(),
            sent_at TIMESTAMP NULL,
            attempt_count INT NOT NULL DEFAULT 0,
            last_attempt_at TIMESTAMP NULL,
            last_error TEXT NULL,
            locked_at TIMESTAMP NULL,
            next_attempt_at TIMESTAMP NULL
        );
        """
    )

    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS admin_job_reports (
            id SERIAL PRIMARY KEY,
            job_name TEXT NOT NULL,
            status TEXT NOT NULL,
            report_data JSONB NOT NULL DEFAULT '{}'::jsonb,
            created_at TIMESTAMP NOT NULL DEFAULT NOW()
        );
        """
    )

    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS admin_tmdb_overrides (
            id SERIAL PRIMARY KEY,
            media_type TEXT NOT NULL,
            tmdb_id BIGINT NOT NULL,
            season_number INT NOT NULL DEFAULT -1,
            override_status_raw TEXT NULL,
            override_release_date DATE NULL,
            override_next_air_date DATE NULL,
            override_final_state TEXT NULL,
            override_final_completed_at DATE NULL,
            reason TEXT NULL,
            admin_email TEXT NULL,
            created_at TIMESTAMP NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
            UNIQUE(media_type, tmdb_id, season_number)
        );
        """
    )

    cursor.execute(
        """
        CREATE INDEX IF NOT EXISTS admin_tmdb_overrides_lookup_idx
        ON admin_tmdb_overrides (media_type, tmdb_id, season_number);
        """
    )

    cursor.execute(
        """
        CREATE INDEX IF NOT EXISTS admin_tmdb_overrides_updated_at_idx
        ON admin_tmdb_overrides (updated_at DESC);
        """
    )

    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS admin_content_action_logs (
            id SERIAL PRIMARY KEY,
            action_type TEXT NOT NULL,
            media_type TEXT NOT NULL,
            tmdb_id BIGINT NOT NULL,
            season_number INT NOT NULL DEFAULT -1,
            reason TEXT NULL,
            admin_email TEXT NULL,
            payload JSONB NOT NULL DEFAULT '{}'::jsonb,
            created_at TIMESTAMP NOT NULL DEFAULT NOW()
        );
        """
    )

    cursor.execute(
        """
        CREATE INDEX IF NOT EXISTS admin_content_action_logs_created_at_idx
        ON admin_content_action_logs (created_at DESC);
        """
    )

    cursor.execute(
        """
        CREATE INDEX IF NOT EXISTS admin_content_action_logs_target_idx
        ON admin_content_action_logs (media_type, tmdb_id, season_number, created_at DESC);
        """
    )

    cursor.execute(
        """
        CREATE INDEX IF NOT EXISTS admin_job_reports_job_name_created_at_idx
        ON admin_job_reports (job_name, created_at DESC);
        """
    )

    cursor.execute(
        """
        CREATE INDEX IF NOT EXISTS admin_job_reports_created_at_idx
        ON admin_job_reports (created_at DESC);
        """
    )

    cursor.execute(
        """
        ALTER TABLE notification_outbox
        ADD COLUMN IF NOT EXISTS change_event_id INT NULL;
        """
    )

    cursor.execute(
        """
        ALTER TABLE notification_outbox
        ADD COLUMN IF NOT EXISTS attempt_count INT NOT NULL DEFAULT 0;
        """
    )

    cursor.execute(
        """
        ALTER TABLE notification_outbox
        ADD COLUMN IF NOT EXISTS last_attempt_at TIMESTAMP NULL;
        """
    )

    cursor.execute(
        """
        ALTER TABLE notification_outbox
        ADD COLUMN IF NOT EXISTS last_error TEXT NULL;
        """
    )

    cursor.execute(
        """
        ALTER TABLE notification_outbox
        ADD COLUMN IF NOT EXISTS locked_at TIMESTAMP NULL;
        """
    )

    cursor.execute(
        """
        ALTER TABLE notification_outbox
        ADD COLUMN IF NOT EXISTS next_attempt_at TIMESTAMP NULL;
        """
    )

    cursor.execute(
        """
        DO $$
        BEGIN
            ALTER TABLE notification_outbox
            ADD CONSTRAINT notification_outbox_change_event_id_fkey
            FOREIGN KEY (change_event_id)
            REFERENCES change_events(id)
            ON DELETE CASCADE;
        EXCEPTION
            WHEN duplicate_object THEN
                NULL;
        END
        $$;
        """
    )

    cursor.execute(
        """
        CREATE UNIQUE INDEX IF NOT EXISTS notification_outbox_change_event_channel_key
        ON notification_outbox (change_event_id, channel);
        """
    )

    cursor.execute(
        """
        CREATE INDEX IF NOT EXISTS notification_outbox_status_channel_created_at_idx
        ON notification_outbox (status, channel, created_at);
        """
    )

    cursor.execute(
        """
        CREATE INDEX IF NOT EXISTS notification_outbox_channel_status_next_attempt_idx
        ON notification_outbox (channel, status, next_attempt_at, created_at);
        """
    )

    cursor.close()
    conn.close()


if __name__ == "__main__":
    init_db()
