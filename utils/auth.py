from functools import wraps

from flask import request, jsonify

from services import auth_service


def require_auth(view_func):
    @wraps(view_func)
    def wrapper(*args, **kwargs):
        auth_header = request.headers.get("Authorization", "")
        if not auth_header.startswith("Bearer "):
            return jsonify({"error": "Unauthorized"}), 401
        token = auth_header.replace("Bearer ", "", 1).strip()
        try:
            payload = auth_service.decode_token(token)
        except Exception:
            return jsonify({"error": "Unauthorized"}), 401
        return view_func(payload, *args, **kwargs)

    return wrapper
