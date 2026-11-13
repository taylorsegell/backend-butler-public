"""Which person a request to the HTTP app may act for."""

import pytest

import auth

TOKENS = auth.parse_user_tokens("Alice=alice-token, bob=bob-token")


def test_parse_user_tokens():
    assert TOKENS == {"alice-token": "alice", "bob-token": "bob"}
    assert auth.parse_user_tokens("") == {}
    for bad in ("alice", "=x", "alice=", "alice=service-token"):
        with pytest.raises(ValueError):
            auth.parse_user_tokens(bad)


def test_service_token_acts_for_whoever_it_names():
    caller = auth.check("/chat", "service-token", None, TOKENS)
    assert caller is not None and caller.acts_for(" Carol ") == "carol"
    assert caller.acts_for(None) is None
    # and reaches the routes a person's token does not
    assert auth.check("/home-assistant", "service-token", None, TOKENS) is not None


def test_person_token_is_bound_to_its_person():
    caller = auth.check("/chat/history", "alice-token", "bob", TOKENS)
    assert caller is not None and caller.acts_for("bob") == "alice"
    assert auth.check("/home-assistant", "alice-token", None, TOKENS) is None
    assert auth.check("/mcp/servers", "alice-token", None, TOKENS) is None


def test_callback_token_reaches_only_its_persons_events():
    token = auth.callback_token("bob")
    assert auth.check("/chat/events", token, "bob", TOKENS).acts_for("x") == "bob"
    assert auth.check("/chat/events", token, "alice", TOKENS) is None
    assert auth.check("/chat", token, "bob", TOKENS) is None


def test_unknown_token_refused():
    assert auth.check("/chat", "nope", None, TOKENS) is None
    assert auth.check("/chat", "", None, TOKENS) is None
