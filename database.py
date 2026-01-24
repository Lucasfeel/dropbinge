import os
from contextlib import contextmanager

import psycopg2
import psycopg2.extras
from flask import g


def _create_connection():
    database_url = os.environ.get("DATABASE_URL")
    if database_url:
        return psycopg2.connect(database_url)

    required_vars = ["DB_NAME", "DB_USER", "DB_PASSWORD", "DB_HOST", "DB_PORT"]
    if not all(os.environ.get(var) for var in required_vars):
        raise ValueError(
            "DB_NAME, DB_USER, DB_PASSWORD, DB_HOST, DB_PORT environment variables are required."
        )

    return psycopg2.connect(
        dbname=os.environ.get("DB_NAME"),
        user=os.environ.get("DB_USER"),
        password=os.environ.get("DB_PASSWORD"),
        host=os.environ.get("DB_HOST"),
        port=os.environ.get("DB_PORT"),
    )


def get_db():
    if "db" not in g:
        g.db = _create_connection()
    return g.db


def get_cursor(db):
    return db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)


@contextmanager
def managed_cursor(conn):
    cursor = get_cursor(conn)
    try:
        yield cursor
    finally:
        try:
            cursor.close()
        except Exception:
            pass


def close_db(exception=None):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def create_standalone_connection():
    return _create_connection()
