import datetime
from urllib.parse import urlencode

import pytest

from services import tmdb_client, tmdb_http_cache


@pytest.fixture(autouse=True)
def clear_tmdb_cache():
    tmdb_http_cache._memory_cache.clear()
    yield
    tmdb_http_cache._memory_cache.clear()


def test_movie_details_cache(client, monkeypatch):
    calls = {"count": 0}

    def fake_movie(movie_id):
        calls["count"] += 1
        return {"id": movie_id}

    monkeypatch.setattr(tmdb_client, "get_movie_details", fake_movie)

    response = client.get("/api/tmdb/movie/11")
    assert response.status_code == 200
    assert response.headers.get("X-Cache") == "MISS"
    assert calls["count"] == 1

    response = client.get("/api/tmdb/movie/11")
    assert response.status_code == 200
    assert response.headers.get("X-Cache") == "HIT"
    assert calls["count"] == 1


def test_search_cache(client, monkeypatch):
    calls = {"count": 0}

    def fake_search(query, page=1, language=None):
        calls["count"] += 1
        return {"results": [{"id": 1, "query": query, "page": page}]}

    monkeypatch.setattr(tmdb_client, "search_multi", fake_search)

    response = client.get("/api/tmdb/search?q=naruto&page=1")
    assert response.status_code == 200
    assert response.headers.get("X-Cache") == "MISS"
    assert calls["count"] == 1

    response = client.get("/api/tmdb/search?q=naruto&page=1")
    assert response.status_code == 200
    assert response.headers.get("X-Cache") == "HIT"
    assert calls["count"] == 1


def test_search_cache_separates_language(client, monkeypatch):
    calls = {"count": 0}

    def fake_search(query, page=1, language=None):
        calls["count"] += 1
        return {"results": [{"id": 1, "query": query, "page": page, "language": language}]}

    monkeypatch.setattr(tmdb_client, "search_multi", fake_search)

    response = client.get("/api/tmdb/search?q=naruto&page=1&language=ko-KR")
    assert response.status_code == 200
    assert response.headers.get("X-Cache") == "MISS"
    assert calls["count"] == 1

    response = client.get("/api/tmdb/search?q=naruto&page=1&language=en-US")
    assert response.status_code == 200
    assert response.headers.get("X-Cache") == "MISS"
    assert calls["count"] == 2


def test_search_cache_expiry(client, monkeypatch):
    calls = {"count": 0}

    def fake_search(query, page=1, language=None):
        calls["count"] += 1
        return {"results": [{"id": 1, "query": query, "page": page}]}

    monkeypatch.setattr(tmdb_client, "search_multi", fake_search)

    response = client.get("/api/tmdb/search?q=naruto&page=1")
    assert response.status_code == 200
    assert response.headers.get("X-Cache") == "MISS"
    assert calls["count"] == 1

    cache_key = tmdb_http_cache.make_cache_key(
        "http:search_multi",
        query_key=urlencode(
            sorted(
                {
                    "q": tmdb_http_cache.normalize_query("naruto"),
                    "page": 1,
                    "language": "",
                }.items()
            )
        ),
    )
    entry = tmdb_http_cache._memory_cache[cache_key]
    entry["expires_at"] = datetime.datetime.utcnow() - datetime.timedelta(seconds=1)

    response = client.get("/api/tmdb/search?q=naruto&page=1")
    assert response.status_code == 200
    assert response.headers.get("X-Cache") == "MISS"
    assert calls["count"] == 2
