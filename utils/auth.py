from functools import wraps

from flask import request, jsonify

import config
from services import auth_service


def _decode_request_token():
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return None
    token = auth_header.replace("Bearer ", "", 1).strip()
    if not token:
        return None
    try:
        return auth_service.decode_token(token)
    except Exception:
        return None


def is_admin_email(email):
    normalized = (email or "").strip().lower()
    if not normalized:
        return False
    if not config.ADMIN_EMAILS:
        return False
    return normalized in config.ADMIN_EMAILS


def require_auth(view_func):
    @wraps(view_func)
    def wrapper(*args, **kwargs):
        payload = _decode_request_token()
        if payload is None:
            return jsonify({"error": "Unauthorized"}), 401
        return view_func(payload, *args, **kwargs)

    return wrapper


def require_admin(view_func):
    @wraps(view_func)
    def wrapper(*args, **kwargs):
        payload = _decode_request_token()
        if payload is None:
            return jsonify({"error": "Unauthorized"}), 401
        if not is_admin_email(payload.get("email")):
            return jsonify({"error": "Forbidden"}), 403
        return view_func(payload, *args, **kwargs)

    return wrapper
