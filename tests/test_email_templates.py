from services.email_templates import build_email_message


def test_date_set_movie_subject_and_body():
    payload = {
        "event_type": "date_set",
        "event_payload": {"from": None, "to": "2030-01-01"},
        "target_type": "movie",
        "tmdb_id": 42,
        "season_number": None,
        "title": "Future Film",
    }

    message = build_email_message(payload)

    assert "[DropBinge]" in message["subject"]
    assert "Future Film" in message["subject"]
    assert "To: 2030-01-01" in message["text"]


def test_date_set_tv_full_next_air_date_includes_field_label():
    payload = {
        "event_type": "date_set",
        "event_payload": {"from": None, "to": "2032-05-05", "field": "next_air_date"},
        "target_type": "tv_full",
        "tmdb_id": 77,
        "season_number": None,
        "title": "Next Episode Show",
    }

    message = build_email_message(payload)

    assert "Next episode date" in message["text"]
    assert "To: 2032-05-05" in message["text"]


def test_date_changed_includes_from_to_and_field():
    payload = {
        "event_type": "date_changed",
        "event_payload": {"from": "2029-01-01", "to": "2029-02-02", "field": "next_air_date"},
        "target_type": "tv_full",
        "tmdb_id": 88,
        "season_number": None,
        "title": "Shifted Show",
    }

    message = build_email_message(payload)

    assert "From: 2029-01-01" in message["text"]
    assert "To: 2029-02-02" in message["text"]
    assert "Next episode date" in message["text"]


def test_season_binge_ready_includes_last_episode_date():
    payload = {
        "event_type": "season_binge_ready",
        "event_payload": {"last_episode_air_date": "2028-12-12"},
        "target_type": "tv_season",
        "tmdb_id": 99,
        "season_number": 2,
        "title": "Binge Season",
    }

    message = build_email_message(payload)

    assert "Last episode air date: 2028-12-12" in message["text"]


def test_full_run_concluded_includes_status_change():
    payload = {
        "event_type": "full_run_concluded",
        "event_payload": {"from": "Returning Series", "to": "Ended"},
        "target_type": "tv_full",
        "tmdb_id": 111,
        "season_number": None,
        "title": "Finale Show",
    }

    message = build_email_message(payload)

    assert "From: Returning Series" in message["text"]
    assert "To: Ended" in message["text"]


def test_subject_includes_title_for_status_milestone():
    payload = {
        "event_type": "status_milestone",
        "event_payload": {"from": "Planned", "to": "In Production"},
        "target_type": "movie",
        "tmdb_id": 222,
        "season_number": None,
        "title": "Status Movie",
    }

    message = build_email_message(payload)

    assert "[DropBinge]" in message["subject"]
    assert "Status Movie" in message["subject"]


def test_app_base_url_includes_deep_link():
    payload = {
        "event_type": "date_set",
        "event_payload": {"from": None, "to": "2030-01-01"},
        "target_type": "tv_season",
        "tmdb_id": 123,
        "season_number": 3,
        "title": "Linked Season",
    }

    message = build_email_message(payload, app_base_url="https://dropbinge.test")

    assert "https://dropbinge.test/title/tv/123/season/3" in message["text"]
