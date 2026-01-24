from flask import Blueprint, jsonify, request

from services import tmdb_client

tmdb_bp = Blueprint("tmdb", __name__, url_prefix="/api/tmdb")


@tmdb_bp.get("/search")
def search():
    query = (request.args.get("q") or "").strip()
    if not query:
        return jsonify({"error": "Missing query"}), 400
    try:
        return jsonify(tmdb_client.search_multi(query))
    except ValueError:
        return jsonify({"error": "tmdb_not_configured", "message": "TMDB is not configured"}), 502
    except Exception:
        return jsonify({"error": "tmdb_upstream_error", "message": "TMDB request failed"}), 502


@tmdb_bp.get("/movie/<int:movie_id>")
def movie_details(movie_id):
    try:
        return jsonify(tmdb_client.get_movie_details(movie_id))
    except ValueError:
        return jsonify({"error": "tmdb_not_configured", "message": "TMDB is not configured"}), 502
    except Exception:
        return jsonify({"error": "tmdb_upstream_error", "message": "TMDB request failed"}), 502


@tmdb_bp.get("/tv/<int:tv_id>")
def tv_details(tv_id):
    try:
        return jsonify(tmdb_client.get_tv_details(tv_id))
    except ValueError:
        return jsonify({"error": "tmdb_not_configured", "message": "TMDB is not configured"}), 502
    except Exception:
        return jsonify({"error": "tmdb_upstream_error", "message": "TMDB request failed"}), 502


@tmdb_bp.get("/tv/<int:tv_id>/season/<int:season_number>")
def tv_season_details(tv_id, season_number):
    try:
        return jsonify(tmdb_client.get_tv_season_details(tv_id, season_number))
    except ValueError:
        return jsonify({"error": "tmdb_not_configured", "message": "TMDB is not configured"}), 502
    except Exception:
        return jsonify({"error": "tmdb_upstream_error", "message": "TMDB request failed"}), 502
