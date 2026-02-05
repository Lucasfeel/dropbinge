import os
import random
import time

import requests


TMDB_BASE_URL = "https://api.themoviedb.org/3"
TMDB_TIMEOUT_SECONDS = 10
TMDB_AUTH_ERROR_CODES = {3, 7, 10, 14, 35, 36, 38, 39}
TMDB_RATE_LIMIT_CODE = 25


class TMDBError(Exception):
    """Base class for TMDB client errors."""


class TMDBConfigError(TMDBError):
    pass


class TMDBAuthError(TMDBError):
    pass


class TMDBRateLimitError(TMDBError):
    pass


class TMDBUpstreamError(TMDBError):
    pass


class TMDBRequestError(TMDBError):
    pass


def _get_auth_params():
    bearer = os.getenv("TMDB_READ_ACCESS_TOKEN") or os.getenv("TMDB_BEARER_TOKEN")
    api_key = os.getenv("TMDB_API_KEY")
    headers = {"Accept": "application/json"}
    params = {}
    if bearer:
        headers["Authorization"] = f"Bearer {bearer}"
    elif api_key:
        params["api_key"] = api_key
    else:
        raise TMDBConfigError("TMDB_READ_ACCESS_TOKEN or TMDB_API_KEY must be set.")
    return headers, params


def _parse_error_payload(response):
    try:
        payload = response.json()
    except ValueError:
        payload = {}
    status_code = payload.get("status_code")
    return status_code, payload.get("status_message")


def _classify_error(response):
    status_code, _ = _parse_error_payload(response)
    http_status = response.status_code
    if http_status in {401, 403} or status_code in TMDB_AUTH_ERROR_CODES:
        return TMDBAuthError
    if http_status == 429 or status_code == TMDB_RATE_LIMIT_CODE:
        return TMDBRateLimitError
    if 500 <= http_status <= 599:
        return TMDBUpstreamError
    if 400 <= http_status <= 499:
        return TMDBRequestError
    return TMDBUpstreamError


def _request(path, params=None):
    headers, base_params = _get_auth_params()
    merged_params = {**base_params, **(params or {})}
    url = f"{TMDB_BASE_URL}{path}"
    for attempt in range(2):
        try:
            response = requests.get(url, headers=headers, params=merged_params, timeout=TMDB_TIMEOUT_SECONDS)
        except requests.RequestException as exc:
            raise TMDBUpstreamError("TMDB request failed.") from exc

        if response.status_code < 400:
            try:
                return response.json()
            except ValueError as exc:
                raise TMDBUpstreamError("TMDB response was not valid JSON.") from exc

        error_cls = _classify_error(response)
        if error_cls in {TMDBRateLimitError, TMDBUpstreamError} and attempt == 0:
            time.sleep(0.3 + random.random() * 0.2)
            continue
        raise error_cls("TMDB request failed.")
    raise TMDBUpstreamError("TMDB request failed.")

def tmdb_get(path, params=None):
    return _request(path, params=params)


def search_multi(query, page=1, language=None):
    params = {"query": query, "page": page, "include_adult": False}
    if language:
        params["language"] = language
    return tmdb_get("/search/multi", params=params)


def get_movie_details(movie_id, append=None):
    params = {}
    if append:
        params["append_to_response"] = append
    return tmdb_get(f"/movie/{movie_id}", params=params)


def get_tv_details(tv_id, append=None, language=None):
    params = {}
    if append:
        params["append_to_response"] = append
    if language:
        params["language"] = language
    return tmdb_get(f"/tv/{tv_id}", params=params)


def get_tv_season_details(tv_id, season_number, append=None):
    params = {}
    if append:
        params["append_to_response"] = append
    return tmdb_get(f"/tv/{tv_id}/season/{season_number}", params=params)


def list_movie_popular(page=1, language=None):
    params = {"page": page}
    if language:
        params["language"] = language
    return tmdb_get("/movie/popular", params=params)


def list_movie_upcoming(page=1, language=None, region=None):
    params = {"page": page}
    if language:
        params["language"] = language
    if region:
        params["region"] = region
    return tmdb_get("/movie/upcoming", params=params)


def list_tv_popular(page=1, language=None):
    params = {"page": page}
    if language:
        params["language"] = language
    return tmdb_get("/tv/popular", params=params)


def list_tv_on_the_air(page=1, language=None):
    params = {"page": page}
    if language:
        params["language"] = language
    return tmdb_get("/tv/on_the_air", params=params)


def list_tv_top_rated(page=1, language=None):
    params = {"page": page}
    if language:
        params["language"] = language
    return tmdb_get("/tv/top_rated", params=params)


def list_tv_airing_today(page=1, language=None):
    params = {"page": page}
    if language:
        params["language"] = language
    return tmdb_get("/tv/airing_today", params=params)


def list_tv_changes(page=1, start_date=None, end_date=None):
    params = {"page": page}
    if start_date:
        params["start_date"] = start_date
    if end_date:
        params["end_date"] = end_date
    return tmdb_get("/tv/changes", params=params)


def list_trending_all_day(page=1, language=None):
    params = {"page": page}
    if language:
        params["language"] = language
    return tmdb_get("/trending/all/day", params=params)


def list_trending_tv_week(page=1, language=None):
    params = {"page": page}
    if language:
        params["language"] = language
    return tmdb_get("/trending/tv/week", params=params)


def discover_movies(params):
    return tmdb_get("/discover/movie", params=params)


def discover_tv(params):
    return tmdb_get("/discover/tv", params=params)


def get_watch_providers(media_type, tmdb_id):
    if media_type not in {"movie", "tv"}:
        raise TMDBRequestError("Invalid media type.")
    return tmdb_get(f"/{media_type}/{tmdb_id}/watch/providers")
