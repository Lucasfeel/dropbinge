import config
from app import app
from flask import request
from views.internal import _validate_cron_secret


def test_validate_cron_secret_missing(monkeypatch):
    monkeypatch.setattr(config, "CRON_SECRET", None)
    with app.test_request_context("/api/internal/dispatch-email", headers={}):
        error = _validate_cron_secret(request)
        assert error[1] == 503


def test_validate_cron_secret_invalid(monkeypatch):
    monkeypatch.setattr(config, "CRON_SECRET", "secret")
    with app.test_request_context(
        "/api/internal/dispatch-email", headers={"X-CRON-SECRET": "wrong"}
    ):
        error = _validate_cron_secret(request)
        assert error[1] == 401


def test_validate_cron_secret_valid(monkeypatch):
    monkeypatch.setattr(config, "CRON_SECRET", "secret")
    with app.test_request_context(
        "/api/internal/dispatch-email", headers={"X-CRON-SECRET": "secret"}
    ):
        error = _validate_cron_secret(request)
        assert error is None
