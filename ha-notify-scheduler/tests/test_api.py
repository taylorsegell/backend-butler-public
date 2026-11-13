"""The HTTP layer's token check: every route but /healthz needs SCHEDULER_TOKEN."""

from __future__ import annotations

import importlib

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def api(tmp_path, monkeypatch):
    def load(token: str):
        monkeypatch.setenv("SCHEDULER_TOKEN", token)
        monkeypatch.setenv("SCHEDULER_DB", str(tmp_path / "api.db"))
        import main

        return TestClient(importlib.reload(main).app)

    return load


def test_healthz_needs_no_token(api):
    assert api("").get("/healthz").status_code == 200


def test_no_token_configured_refuses(api):
    assert api("").get("/tasks").status_code == 503


def test_wrong_token_refused(api):
    client = api("secret")
    assert client.get("/tasks").status_code == 401
    assert client.get("/tasks", headers={"Authorization": "Bearer nope"}).status_code == 401


def test_right_token_allowed(api):
    client = api("secret")
    resp = client.get("/tasks", headers={"Authorization": "Bearer secret"})
    assert resp.status_code == 200 and resp.json() == []
