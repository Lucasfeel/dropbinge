from flask import Blueprint, jsonify, request

from services import tmdb_client
from utils.auth import require_auth

tmdb_bp = Blueprint("tmdb", __name__, url_prefix="/api/tmdb")


@tmdb_bp.get("/search")
@require_auth
def search(payload):
    query = (request.args.get("q") or "").strip()
    if not query:
        return jsonify({"error": "Missing query"}), 400
    return jsonify(tmdb_client.search_multi(query))


@tmdb_bp.get("/movie/<int:movie_id>")
@require_auth
def movie_details(payload, movie_id):
    return jsonify(tmdb_client.get_movie_details(movie_id))


@tmdb_bp.get("/tv/<int:tv_id>")
@require_auth
def tv_details(payload, tv_id):
    return jsonify(tmdb_client.get_tv_details(tv_id))


@tmdb_bp.get("/tv/<int:tv_id>/season/<int:season_number>")
@require_auth
def tv_season_details(payload, tv_id, season_number):
    return jsonify(tmdb_client.get_tv_season_details(tv_id, season_number))
