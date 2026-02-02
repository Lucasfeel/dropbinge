import logging
import time
from urllib.parse import urlencode

from flask import Blueprint, jsonify, request

from services import tmdb_client
from services import tmdb_http_cache

tmdb_bp = Blueprint("tmdb", __name__, url_prefix="/api/tmdb")
logger = logging.getLogger(__name__)


def _json_response(payload, status=200, cache_status=None):
    response = jsonify(payload)
    response.status_code = status
    if cache_status:
        response.headers["X-Cache"] = cache_status
    return response


def _tmdb_error_response(error_key, message):
    return _json_response({"error": error_key, "message": message}, status=502, cache_status="MISS")


def _log_cache(kind, cache_status, latency_ms):
    logger.info("tmdb_cache kind=%s status=%s upstream_ms=%s", kind, cache_status, latency_ms)


def _normalized_title(item, media_type):
    resolved_media = media_type or item.get("media_type") or "movie"
    title = item.get("title") or item.get("name") or f"TMDB {item.get('id')}"
    date = item.get("release_date") if resolved_media == "movie" else item.get("first_air_date")
    return {
        "id": item.get("id"),
        "media_type": resolved_media,
        "title": title,
        "poster_path": item.get("poster_path"),
        "backdrop_path": item.get("backdrop_path"),
        "date": date,
        "vote_average": item.get("vote_average"),
        "vote_count": item.get("vote_count"),
    }


def _normalize_list_payload(payload, media_type):
    results = payload.get("results") or []
    normalized = [
        _normalized_title(item, media_type) for item in results if isinstance(item, dict) and item.get("id")
    ]
    return {
        "page": payload.get("page", 1),
        "total_pages": payload.get("total_pages", 1),
        "results": normalized,
    }


def _list_cache_key(path, params):
    normalized_params = {key: value for key, value in params.items() if value is not None}
    query_key = f"{path}?{urlencode(sorted(normalized_params.items()))}"
    return tmdb_http_cache.make_cache_key("http:tmdb_list", query_key=query_key)


def _list_endpoint(path, fetcher, media_type, params):
    cache_key = _list_cache_key(path, params)
    try:
        cached = tmdb_http_cache.get_cached(None, *cache_key)
        if cached is not None:
            _log_cache(path, "HIT", 0)
            return _json_response(cached, cache_status="HIT")
        start = time.perf_counter()
        payload = fetcher(**params)
        latency_ms = int((time.perf_counter() - start) * 1000)
        normalized = _normalize_list_payload(payload, media_type)
        tmdb_http_cache.set_cached(
            None,
            cache_key[0],
            cache_key[1],
            cache_key[2],
            normalized,
            tmdb_http_cache.LIST_TTL_SECONDS,
        )
        _log_cache(path, "MISS", latency_ms)
        return _json_response(normalized, cache_status="MISS")
    except tmdb_client.TMDBConfigError:
        return _tmdb_error_response(
            "tmdb_not_configured", "TMDB credentials are not configured"
        )
    except tmdb_client.TMDBAuthError:
        return _tmdb_error_response("tmdb_auth_error", "TMDB authentication failed")
    except tmdb_client.TMDBRateLimitError:
        return _tmdb_error_response("tmdb_rate_limited", "TMDB rate limit exceeded")
    except (tmdb_client.TMDBUpstreamError, tmdb_client.TMDBRequestError):
        return _tmdb_error_response("tmdb_upstream_error", "TMDB request failed")


@tmdb_bp.get("/search")
def search():
    query = (request.args.get("q") or "").strip()
    if not query:
        return _json_response({"error": "Missing query"}, status=400, cache_status="MISS")
    page_raw = request.args.get("page", "1")
    try:
        page = int(page_raw)
    except ValueError:
        return _json_response({"error": "Invalid page"}, status=400, cache_status="MISS")
    if page < 1:
        return _json_response({"error": "Invalid page"}, status=400, cache_status="MISS")
    language = request.args.get("language")
    cache_key = tmdb_http_cache.make_cache_key(
        "http:search_multi",
        query_key=f"q={tmdb_http_cache.normalize_query(query)}&page={page}",
    )
    try:
        cached = tmdb_http_cache.get_cached(None, *cache_key)
        if cached is not None:
            _log_cache("search_multi", "HIT", 0)
            return _json_response(cached, cache_status="HIT")
        start = time.perf_counter()
        payload = tmdb_client.search_multi(query, page=page, language=language)
        latency_ms = int((time.perf_counter() - start) * 1000)
        tmdb_http_cache.set_cached(
            None,
            cache_key[0],
            cache_key[1],
            cache_key[2],
            payload,
            tmdb_http_cache.SEARCH_TTL_SECONDS,
        )
        _log_cache("search_multi", "MISS", latency_ms)
        return _json_response(payload, cache_status="MISS")
    except tmdb_client.TMDBConfigError:
        return _tmdb_error_response(
            "tmdb_not_configured", "TMDB credentials are not configured"
        )
    except tmdb_client.TMDBAuthError:
        return _tmdb_error_response("tmdb_auth_error", "TMDB authentication failed")
    except tmdb_client.TMDBRateLimitError:
        return _tmdb_error_response("tmdb_rate_limited", "TMDB rate limit exceeded")
    except (tmdb_client.TMDBUpstreamError, tmdb_client.TMDBRequestError):
        return _tmdb_error_response("tmdb_upstream_error", "TMDB request failed")


@tmdb_bp.get("/movie/<int:movie_id>")
def movie_details(movie_id):
    cache_key = tmdb_http_cache.make_cache_key("http:movie_detail", tmdb_id=movie_id)
    try:
        cached = tmdb_http_cache.get_cached(None, *cache_key)
        if cached is not None:
            _log_cache("movie_detail", "HIT", 0)
            return _json_response(cached, cache_status="HIT")
        start = time.perf_counter()
        payload = tmdb_client.get_movie_details(movie_id)
        latency_ms = int((time.perf_counter() - start) * 1000)
        tmdb_http_cache.set_cached(
            None,
            cache_key[0],
            cache_key[1],
            cache_key[2],
            payload,
            tmdb_http_cache.MOVIE_TTL_SECONDS,
        )
        _log_cache("movie_detail", "MISS", latency_ms)
        return _json_response(payload, cache_status="MISS")
    except tmdb_client.TMDBConfigError:
        return _tmdb_error_response(
            "tmdb_not_configured", "TMDB credentials are not configured"
        )
    except tmdb_client.TMDBAuthError:
        return _tmdb_error_response("tmdb_auth_error", "TMDB authentication failed")
    except tmdb_client.TMDBRateLimitError:
        return _tmdb_error_response("tmdb_rate_limited", "TMDB rate limit exceeded")
    except (tmdb_client.TMDBUpstreamError, tmdb_client.TMDBRequestError):
        return _tmdb_error_response("tmdb_upstream_error", "TMDB request failed")


@tmdb_bp.get("/tv/<int:tv_id>")
def tv_details(tv_id):
    cache_key = tmdb_http_cache.make_cache_key("http:tv_detail", tmdb_id=tv_id)
    try:
        cached = tmdb_http_cache.get_cached(None, *cache_key)
        if cached is not None:
            _log_cache("tv_detail", "HIT", 0)
            return _json_response(cached, cache_status="HIT")
        start = time.perf_counter()
        payload = tmdb_client.get_tv_details(tv_id)
        latency_ms = int((time.perf_counter() - start) * 1000)
        tmdb_http_cache.set_cached(
            None,
            cache_key[0],
            cache_key[1],
            cache_key[2],
            payload,
            tmdb_http_cache.TV_TTL_SECONDS,
        )
        _log_cache("tv_detail", "MISS", latency_ms)
        return _json_response(payload, cache_status="MISS")
    except tmdb_client.TMDBConfigError:
        return _tmdb_error_response(
            "tmdb_not_configured", "TMDB credentials are not configured"
        )
    except tmdb_client.TMDBAuthError:
        return _tmdb_error_response("tmdb_auth_error", "TMDB authentication failed")
    except tmdb_client.TMDBRateLimitError:
        return _tmdb_error_response("tmdb_rate_limited", "TMDB rate limit exceeded")
    except (tmdb_client.TMDBUpstreamError, tmdb_client.TMDBRequestError):
        return _tmdb_error_response("tmdb_upstream_error", "TMDB request failed")


@tmdb_bp.get("/tv/<int:tv_id>/season/<int:season_number>")
def tv_season_details(tv_id, season_number):
    cache_key = tmdb_http_cache.make_cache_key(
        "http:tv_season_detail", tmdb_id=tv_id, season_number=season_number
    )
    try:
        cached = tmdb_http_cache.get_cached(None, *cache_key)
        if cached is not None:
            _log_cache("tv_season_detail", "HIT", 0)
            return _json_response(cached, cache_status="HIT")
        start = time.perf_counter()
        payload = tmdb_client.get_tv_season_details(tv_id, season_number)
        latency_ms = int((time.perf_counter() - start) * 1000)
        tmdb_http_cache.set_cached(
            None,
            cache_key[0],
            cache_key[1],
            cache_key[2],
            payload,
            tmdb_http_cache.SEASON_TTL_SECONDS,
        )
        _log_cache("tv_season_detail", "MISS", latency_ms)
        return _json_response(payload, cache_status="MISS")
    except tmdb_client.TMDBConfigError:
        return _tmdb_error_response(
            "tmdb_not_configured", "TMDB credentials are not configured"
        )
    except tmdb_client.TMDBAuthError:
        return _tmdb_error_response("tmdb_auth_error", "TMDB authentication failed")
    except tmdb_client.TMDBRateLimitError:
        return _tmdb_error_response("tmdb_rate_limited", "TMDB rate limit exceeded")
    except (tmdb_client.TMDBUpstreamError, tmdb_client.TMDBRequestError):
        return _tmdb_error_response("tmdb_upstream_error", "TMDB request failed")


def _get_page_param():
    page = request.args.get("page", type=int, default=1)
    if page < 1:
        return None
    return page


@tmdb_bp.get("/list/movie/popular")
def list_movie_popular():
    page = _get_page_param()
    if page is None:
        return _json_response({"error": "Invalid page"}, status=400, cache_status="MISS")
    language = request.args.get("language")
    params = {"page": page, "language": language}
    return _list_endpoint("/movie/popular", tmdb_client.list_movie_popular, "movie", params)


@tmdb_bp.get("/list/movie/upcoming")
def list_movie_upcoming():
    page = _get_page_param()
    if page is None:
        return _json_response({"error": "Invalid page"}, status=400, cache_status="MISS")
    language = request.args.get("language")
    region = request.args.get("region")
    params = {"page": page, "language": language, "region": region}
    return _list_endpoint("/movie/upcoming", tmdb_client.list_movie_upcoming, "movie", params)


@tmdb_bp.get("/list/tv/popular")
def list_tv_popular():
    page = _get_page_param()
    if page is None:
        return _json_response({"error": "Invalid page"}, status=400, cache_status="MISS")
    language = request.args.get("language")
    params = {"page": page, "language": language}
    return _list_endpoint("/tv/popular", tmdb_client.list_tv_popular, "tv", params)


@tmdb_bp.get("/list/tv/on_the_air")
def list_tv_on_the_air():
    page = _get_page_param()
    if page is None:
        return _json_response({"error": "Invalid page"}, status=400, cache_status="MISS")
    language = request.args.get("language")
    params = {"page": page, "language": language}
    return _list_endpoint("/tv/on_the_air", tmdb_client.list_tv_on_the_air, "tv", params)


@tmdb_bp.get("/list/trending/all/day")
def list_trending_all_day():
    page = _get_page_param()
    if page is None:
        return _json_response({"error": "Invalid page"}, status=400, cache_status="MISS")
    language = request.args.get("language")
    params = {"page": page, "language": language}
    return _list_endpoint("/trending/all/day", tmdb_client.list_trending_all_day, None, params)
