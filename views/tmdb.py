import logging
import time

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
