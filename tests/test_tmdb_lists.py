from datetime import date, timedelta

from services import tmdb_client


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
