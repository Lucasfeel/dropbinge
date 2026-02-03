from services import tmdb_client


def test_list_tv_seasons_thread_context_uses_memory_cache(client, monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "postgres://dummy")

    def fake_list_tv_on_the_air(page=1, language=None):
        return {
            "page": page,
            "total_pages": 10,
            "results": [
                {"id": 100, "name": "A"},
                {"id": 200, "name": "B"},
            ],
        }

    def fake_get_tv_details(tv_id, append=None):
        return {
            "id": tv_id,
            "name": f"Show {tv_id}",
            "next_episode_to_air": {"season_number": 2, "air_date": "2099-01-01"},
            "last_episode_to_air": {"season_number": 1, "air_date": "2020-01-01"},
            "seasons": [
                {
                    "season_number": 1,
                    "air_date": "2020-01-01",
                    "name": "S1",
                    "poster_path": "/p.jpg",
                },
                {
                    "season_number": 2,
                    "air_date": "2099-01-01",
                    "name": "S2",
                    "poster_path": "/p2.jpg",
                },
            ],
        }

    monkeypatch.setattr(tmdb_client, "list_tv_on_the_air", fake_list_tv_on_the_air)
    monkeypatch.setattr(tmdb_client, "get_tv_details", fake_get_tv_details)

    resp = client.get("/api/tmdb/list/tv/seasons?page=2&list=on-the-air")

    assert resp.status_code == 200
    body = resp.get_json()
    assert "results" in body
    assert len(body["results"]) >= 1
    assert body["page"] == 2
    assert all(item["season_number"] == 2 for item in body["results"])
    series_ids = [item["series_id"] for item in body["results"]]
    assert len(series_ids) == len(set(series_ids))
