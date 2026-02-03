from datetime import date, timedelta

from services import tmdb_client
from views import tmdb as tmdb_views


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


def test_list_trending_all_day_marks_ended_tv_as_completed(client, monkeypatch):
    today = date.today()
    yesterday = (today - timedelta(days=1)).isoformat()

    def fake_list_trending_all_day(page=1, language=None):
        return {
            "page": page,
            "total_pages": 1,
            "results": [
                {"id": 1, "media_type": "tv", "name": "Ended TV"},
                {
                    "id": 2,
                    "media_type": "movie",
                    "title": "Released Movie",
                    "release_date": yesterday,
                },
            ],
        }

    def fake_get_tv_details(tv_id, append=None):
        return {"id": tv_id, "status": "Ended"}

    monkeypatch.setattr(tmdb_client, "list_trending_all_day", fake_list_trending_all_day)
    monkeypatch.setattr(tmdb_client, "get_tv_details", fake_get_tv_details)

    resp = client.get("/api/tmdb/list/trending/all/day?page=1")

    assert resp.status_code == 200
    body = resp.get_json()
    results = {item["id"]: item for item in body["results"]}
    assert results[1]["is_completed"] is True
    assert results[2]["is_completed"] is True


def test_list_movie_out_now_uses_date_window(client, monkeypatch):
    class FixedDate(date):
        @classmethod
        def today(cls):
            return cls(2024, 1, 10)

    captured = {}

    def fake_discover_movies(params):
        captured.update(params)
        return {
            "page": params["page"],
            "total_pages": 1,
            "results": [
                {"id": 10, "title": "Out Now", "release_date": "2024-01-05"},
            ],
        }

    monkeypatch.setattr(tmdb_views, "date", FixedDate)
    monkeypatch.setattr(tmdb_client, "discover_movies", fake_discover_movies)

    resp = client.get("/api/tmdb/list/movie/out_now?page=1")

    assert resp.status_code == 200
    body = resp.get_json()
    expected_start = (date(2024, 1, 10) - timedelta(days=60)).isoformat()
    expected_end = date(2024, 1, 10).isoformat()
    assert captured["sort_by"] == "popularity.desc"
    assert captured["primary_release_date.gte"] == expected_start
    assert captured["primary_release_date.lte"] == expected_end
    assert body["results"][0]["is_completed"] is True


def test_list_tv_seasons_upcoming_filters_future(client, monkeypatch):
    class FixedDate(date):
        @classmethod
        def today(cls):
            return cls(2024, 1, 10)

    def fake_list_tv_popular(page=1, language=None):
        return {
            "page": page,
            "total_pages": 1,
            "results": [{"id": 200, "name": "Future Show"}],
        }

    def fake_get_tv_details(tv_id):
        return {
            "id": tv_id,
            "name": "Future Show",
            "seasons": [
                {"season_number": 1, "name": "S1", "air_date": "2020-01-01"},
                {"season_number": 2, "name": "S2", "air_date": "2024-02-01"},
            ],
        }

    monkeypatch.setattr(tmdb_views, "date", FixedDate)
    monkeypatch.setattr(tmdb_client, "list_tv_popular", fake_list_tv_popular)
    monkeypatch.setattr(tmdb_client, "get_tv_details", fake_get_tv_details)

    resp = client.get("/api/tmdb/list/tv/seasons?page=1&list=upcoming")

    assert resp.status_code == 200
    body = resp.get_json()
    assert len(body["results"]) == 1
    assert body["results"][0]["season_number"] == 2
    assert body["results"][0]["is_completed"] is False
    assert 1 <= body["total_pages"] <= 5
