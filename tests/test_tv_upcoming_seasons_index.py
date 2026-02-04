from services import tv_upcoming_seasons_index


def test_extract_upcoming_seasons_includes_future_season_one():
    today_iso = "2024-01-01"
    details = {
        "id": 101,
        "name": "New Show",
        "seasons": [{"season_number": 1, "air_date": "2024-02-01", "name": "Season 1"}],
    }
    results = tv_upcoming_seasons_index._extract_upcoming_seasons(details, today_iso)
    assert len(results) == 1
    assert results[0]["season_number"] == 1


def test_extract_upcoming_seasons_includes_future_season_two_after_season_one():
    today_iso = "2024-01-01"
    details = {
        "id": 202,
        "name": "Returning Show",
        "last_episode_to_air": {"season_number": 1},
        "seasons": [{"season_number": 2, "air_date": "2024-03-01", "name": "Season 2"}],
    }
    results = tv_upcoming_seasons_index._extract_upcoming_seasons(details, today_iso)
    assert len(results) == 1
    assert results[0]["season_number"] == 2


def test_extract_upcoming_seasons_excludes_started_season():
    today_iso = "2024-01-01"
    details = {
        "id": 303,
        "name": "Ongoing Show",
        "last_episode_to_air": {"season_number": 2},
        "seasons": [{"season_number": 2, "air_date": "2024-03-01", "name": "Season 2"}],
    }
    results = tv_upcoming_seasons_index._extract_upcoming_seasons(details, today_iso)
    assert results == []


def test_extract_upcoming_seasons_uses_next_episode_date():
    today_iso = "2024-01-01"
    details = {
        "id": 404,
        "name": "Next Episode Show",
        "next_episode_to_air": {"season_number": 3, "air_date": "2024-04-15"},
        "seasons": [{"season_number": 3, "air_date": None, "name": "Season 3"}],
    }
    results = tv_upcoming_seasons_index._extract_upcoming_seasons(details, today_iso)
    assert len(results) == 1
    assert results[0]["date"] == "2024-04-15"


def test_dedupe_sort_trim():
    items = [
        {"series_id": 1, "season_number": 2, "date": "2024-05-01", "popularity": 10},
        {"series_id": 1, "season_number": 2, "date": "2024-04-01", "popularity": 5},
        {"series_id": 2, "season_number": 1, "date": "2024-04-01", "popularity": 50},
        {"series_id": 3, "season_number": 1, "date": "2024-06-01", "popularity": 1},
    ]
    result = tv_upcoming_seasons_index._dedupe_sort_trim(items, max_items=2)
    assert len(result) == 2
    assert result[0]["series_id"] == 2
    assert result[1]["series_id"] == 1
