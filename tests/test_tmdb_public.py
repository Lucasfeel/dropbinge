from services import tmdb_client


def test_tmdb_search_public(client, monkeypatch):
    monkeypatch.setattr(
        tmdb_client,
        "search_multi",
        lambda query, page=1, language=None: {"results": [{"id": 1}]},
    )
    response = client.get("/api/tmdb/search?q=matrix")
    assert response.status_code == 200
    assert response.get_json() == {"results": [{"id": 1}]}


def test_tmdb_movie_public(client, monkeypatch):
    monkeypatch.setattr(tmdb_client, "get_movie_details", lambda movie_id: {"id": movie_id})
    response = client.get("/api/tmdb/movie/1")
    assert response.status_code == 200
    assert response.get_json() == {"id": 1}


def test_watch_providers_cache_key_includes_media_type_and_region(client, monkeypatch):
    calls = {"count": 0}

    def fake_watch_providers(media_type, item_id):
        calls["count"] += 1
        return {"results": {"US": {"link": f"https://{media_type}/{item_id}"}}}

    monkeypatch.setattr(tmdb_client, "get_watch_providers", fake_watch_providers)

    first = client.get("/api/tmdb/watch-providers/movie/99?region=US")
    assert first.status_code == 200
    assert first.headers.get("X-Cache") == "MISS"

    second = client.get("/api/tmdb/watch-providers/tv/99?region=US")
    assert second.status_code == 200
    assert second.headers.get("X-Cache") == "MISS"

    third = client.get("/api/tmdb/watch-providers/movie/99?region=CA")
    assert third.status_code == 200
    assert third.headers.get("X-Cache") == "MISS"

    assert calls["count"] == 3
