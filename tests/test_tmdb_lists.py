from datetime import date, timedelta

from services import tmdb_client


def test_list_tv_seasons_popular_sets_completed(client, monkeypatch):
    def fake_list_tv_popular(page=1, language=None):
        return {
            "page": page,
            "total_pages": 1,
            "results": [
                {"id": 100, "name": "Show A"},
            ],
        }

    def fake_get_tv_details(tv_id, append=None):
        return {
            "id": tv_id,
            "name": "Show A",
            "status": "Returning Series",
            "next_episode_to_air": {"season_number": 3},
            "seasons": [
                {"season_number": 1, "name": "S1", "air_date": "2020-01-01"},
                {"season_number": 2, "name": "S2", "air_date": "2021-01-01"},
                {"season_number": 3, "name": "S3", "air_date": "2099-01-01"},
            ],
        }

    monkeypatch.setattr(tmdb_client, "list_tv_popular", fake_list_tv_popular)
    monkeypatch.setattr(tmdb_client, "get_tv_details", fake_get_tv_details)

    resp = client.get("/api/tmdb/list/tv/seasons?page=1&list=popular")

    assert resp.status_code == 200
    body = resp.get_json()
    assert len(body["results"]) == 3
    season_map = {item["season_number"]: item for item in body["results"]}
    assert season_map[1]["is_completed"] is True
    assert season_map[2]["is_completed"] is True
    assert season_map[3]["is_completed"] is False


def test_list_movie_upcoming_filters_released(client, monkeypatch):
    today = date.today()
    yesterday = (today - timedelta(days=1)).isoformat()
    tomorrow = (today + timedelta(days=1)).isoformat()

    def fake_list_movie_upcoming(page=1, language=None, region=None):
        return {
            "page": page,
            "total_pages": 1,
            "results": [
                {"id": 1, "title": "Released", "release_date": yesterday},
                {"id": 2, "title": "Future", "release_date": tomorrow},
            ],
        }

    monkeypatch.setattr(tmdb_client, "list_movie_upcoming", fake_list_movie_upcoming)

    resp = client.get("/api/tmdb/list/movie/upcoming?page=1")

    assert resp.status_code == 200
    body = resp.get_json()
    assert body["results"] == [
        {
            "id": 2,
            "media_type": "movie",
            "title": "Future",
            "poster_path": None,
            "backdrop_path": None,
            "date": tomorrow,
            "vote_average": None,
            "vote_count": None,
            "is_completed": None,
        }
    ]


def test_list_movie_popular_sets_completed(client, monkeypatch):
    today = date.today()
    yesterday = (today - timedelta(days=1)).isoformat()
    tomorrow = (today + timedelta(days=1)).isoformat()

    def fake_list_movie_popular(page=1, language=None):
        return {
            "page": page,
            "total_pages": 1,
            "results": [
                {"id": 1, "title": "Released", "release_date": yesterday},
                {"id": 2, "title": "Future", "release_date": tomorrow},
            ],
        }

    monkeypatch.setattr(tmdb_client, "list_movie_popular", fake_list_movie_popular)

    resp = client.get("/api/tmdb/list/movie/popular?page=1")

    assert resp.status_code == 200
    body = resp.get_json()
    assert body["results"][0]["is_completed"] is True
    assert body["results"][1]["is_completed"] is None


def test_list_tv_popular_marks_ended_as_completed(client, monkeypatch):
    def fake_list_tv_popular(page=1, language=None):
        return {
            "page": page,
            "total_pages": 1,
            "results": [
                {"id": 100, "name": "Ended Show"},
                {"id": 101, "name": "Returning Show"},
            ],
        }

    def fake_get_tv_details(tv_id, append=None):
        if tv_id == 100:
            return {"id": tv_id, "status": "Ended"}
        return {"id": tv_id, "status": "Returning Series"}

    monkeypatch.setattr(tmdb_client, "list_tv_popular", fake_list_tv_popular)
    monkeypatch.setattr(tmdb_client, "get_tv_details", fake_get_tv_details)

    resp = client.get("/api/tmdb/list/tv/popular?page=1")

    assert resp.status_code == 200
    body = resp.get_json()
    results = {item["id"]: item for item in body["results"]}
    assert results[100]["is_completed"] is True
    assert results[101]["is_completed"] is None
