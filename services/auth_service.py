import datetime

import bcrypt
import jwt

import config


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))


def generate_token(user_id: int, email: str) -> str:
    payload = {
        "sub": str(user_id),
        "email": email,
        "iat": datetime.datetime.utcnow(),
    }
    return jwt.encode(payload, config.JWT_SECRET, algorithm="HS256")


def decode_token(token: str):
    return jwt.decode(token, config.JWT_SECRET, algorithms=["HS256"])
