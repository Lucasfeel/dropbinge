from flask import Blueprint, jsonify, request

from database import get_db, get_cursor
from services import auth_service
from utils.auth import require_auth

auth_bp = Blueprint("auth", __name__, url_prefix="/api/auth")


@auth_bp.post("/register")
def register():
    data = request.get_json() or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""
    if not email or not password:
        return jsonify({"error": "Email and password required."}), 400

    db = get_db()
    cursor = get_cursor(db)
    cursor.execute("SELECT id, password_hash FROM users WHERE email = %s;", (email,))
    user = cursor.fetchone()
    password_hash = auth_service.hash_password(password)
    if user:
        if user["password_hash"]:
            return jsonify({"error": "Email already registered."}), 409
        cursor.execute(
            "UPDATE users SET password_hash = %s WHERE id = %s;",
            (password_hash, user["id"]),
        )
        user_id = user["id"]
    else:
        cursor.execute(
            "INSERT INTO users (email, password_hash) VALUES (%s, %s) RETURNING id;",
            (email, password_hash),
        )
        user_id = cursor.fetchone()["id"]
    db.commit()
    token = auth_service.generate_token(user_id, email)
    return jsonify({"token": token, "user": {"id": user_id, "email": email}})


@auth_bp.post("/login")
def login():
    data = request.get_json() or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""
    if not email or not password:
        return jsonify({"error": "Email and password required."}), 400

    db = get_db()
    cursor = get_cursor(db)
    cursor.execute("SELECT id, email, password_hash FROM users WHERE email = %s;", (email,))
    user = cursor.fetchone()
    if not user or not user["password_hash"]:
        return jsonify({"error": "Invalid credentials."}), 401
    if not auth_service.verify_password(password, user["password_hash"]):
        return jsonify({"error": "Invalid credentials."}), 401
    token = auth_service.generate_token(user["id"], user["email"])
    return jsonify({"token": token, "user": {"id": user["id"], "email": user["email"]}})


@auth_bp.get("/me")
@require_auth
def me(payload):
    return jsonify({"user": {"id": int(payload["sub"]), "email": payload["email"]}})
