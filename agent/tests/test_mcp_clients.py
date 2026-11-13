"""The butler entry in agent/mcp.yaml becomes a plain callback-enabled MCP toolset."""

import dataclasses
from pathlib import Path
from typing import Any

import pytest
from livekit.agents import mcp

import auth
import mcp_clients

MCP_YAML = Path(__file__).resolve().parents[1] / "mcp.yaml"
FAKE_TOKEN = "test-butler-token"


class Recorder:
    """Stands in for mcp.MCPServerHTTP and keeps its keyword arguments."""

    def __init__(self, **kwargs: Any) -> None:
        self.kwargs = kwargs


@pytest.fixture
def setup(monkeypatch):
    monkeypatch.setattr(mcp_clients.mcp, "MCPServerHTTP", Recorder)
    monkeypatch.setattr(
        mcp_clients,
        "settings",
        dataclasses.replace(
            mcp_clients.settings,
            callback_base_url="http://cb:8952",
            mcp_config=str(MCP_YAML),
        ),
    )
    for var in ("BUTLER_MCP_URL", "BUTLER_API_TOKEN"):
        monkeypatch.delenv(var, raising=False)
    return monkeypatch


def _butler(user_id):
    return next((t for t in mcp_clients.toolsets(user_id) if t.id == "butler"), None)


def _enable(monkeypatch):
    monkeypatch.setenv("BUTLER_MCP_URL", "http://ha:1234/mcp")
    monkeypatch.setenv("BUTLER_API_TOKEN", FAKE_TOKEN)


def _server(toolset):
    return toolset._mcp_server.kwargs


def test_skipped_without_url_and_token(setup):
    assert _butler("Alex") is None


def test_skipped_with_only_one_variable(setup):
    setup.setenv("BUTLER_MCP_URL", "http://ha:1234/mcp")
    assert _butler("Alex") is None


def test_configured_toolset(setup):
    _enable(setup)
    toolset = _butler("Alex")
    assert type(toolset) is mcp.MCPToolset  # not Guarded: no confirm, no restriction
    server = _server(toolset)
    assert server["url"] == "http://ha:1234/mcp"
    assert server["client_session_timeout_seconds"] == 30.0
    headers = server["headers"]
    assert headers["Authorization"] == f"Bearer {FAKE_TOKEN}"
    assert headers["X-Callback-Url"] == "http://cb:8952/chat/events?user=Alex"
    assert headers["X-Callback-Token"] == auth.callback_token("Alex")


def test_no_callback_headers_without_user(setup):
    _enable(setup)
    assert _server(_butler(None))["headers"] == {
        "Authorization": f"Bearer {FAKE_TOKEN}"
    }


def test_no_callback_headers_without_base_url(setup):
    _enable(setup)
    setup.setattr(
        mcp_clients,
        "settings",
        dataclasses.replace(mcp_clients.settings, callback_base_url=""),
    )
    headers = _server(_butler("Alex"))["headers"]
    assert "X-Callback-Url" not in headers
    assert "X-Callback-Token" not in headers


def test_not_a_restricted_server(setup):
    _enable(setup)
    assert "butler" not in [s["id"] for s in mcp_clients.restricted()]
