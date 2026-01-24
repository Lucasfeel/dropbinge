from services import tmdb_client


def test_tmdb_search_public(client, monkeypatch):
    monkeypatch.setattr(tmdb_client, "search_multi", lambda query: {"results": [{"id": 1}]})
    response = client.get("/api/tmdb/search?q=matrix")
    assert response.status_code == 200
    assert response.get_json() == {"results": [{"id": 1}]}


def test_tmdb_movie_public(client, monkeypatch):
    monkeypatch.setattr(tmdb_client, "get_movie_details", lambda movie_id: {"id": movie_id})
    response = client.get("/api/tmdb/movie/1")
    assert response.status_code == 200
    assert response.get_json() == {"id": 1}
