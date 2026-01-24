import os

import requests


TMDB_BASE_URL = "https://api.themoviedb.org/3"


def _get_auth_params():
    bearer = os.getenv("TMDB_BEARER_TOKEN")
    api_key = os.getenv("TMDB_API_KEY")
    headers = {"Accept": "application/json"}
    params = {}
    if bearer:
        headers["Authorization"] = f"Bearer {bearer}"
    elif api_key:
        params["api_key"] = api_key
    else:
        raise ValueError("TMDB_BEARER_TOKEN or TMDB_API_KEY must be set.")
    return headers, params


def _get(path, params=None):
    headers, base_params = _get_auth_params()
    merged_params = {**base_params, **(params or {})}
    response = requests.get(f"{TMDB_BASE_URL}{path}", headers=headers, params=merged_params, timeout=10)
    response.raise_for_status()
    return response.json()


def search_multi(query):
    return _get("/search/multi", params={"query": query})


def get_movie_details(movie_id):
    return _get(f"/movie/{movie_id}")


def get_tv_details(tv_id):
    return _get(f"/tv/{tv_id}")


def get_tv_season_details(tv_id, season_number):
    return _get(f"/tv/{tv_id}/season/{season_number}")
