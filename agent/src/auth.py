"""Who a request to the HTTP app acts for.

TEXT_API_TOKEN is the service token: the Home Assistant integration and the scheduler
hold it, and a request carrying it may name any person in its `user` field. A person's
own client (a Shortcut, a script) gets a token from TEXT_USER_TOKENS instead, which
binds every request to that person whatever `user` it names, and reaches only /chat.
An MCP server with `callback: true` gets a token derived for one person, which reaches
only /chat/events.
"""

from __future__ import annotations

import hashlib
import hmac
from dataclasses import dataclass

from config import settings


def user_id(value: object) -> str | None:
    """The id a request names its person by; ids are casefolded names."""
    found = str(value or "").strip().casefold()
    return found or None


def parse_user_tokens(raw: str) -> dict[str, str]:
    """`name=token,name=token` into token -> person id; malformed pairs are an error."""
    tokens: dict[str, str] = {}
    for pair in raw.split(","):
        if not pair.strip():
            continue
        name, sep, token = pair.partition("=")
        person, token = user_id(name), token.strip()
        if not sep or person is None or not token:
            raise ValueError(
                f"TEXT_USER_TOKENS: expected name=token, got {pair.strip()!r}"
            )
        if token == settings.text_api_token:
            raise ValueError(f"TEXT_USER_TOKENS: {person}'s token is TEXT_API_TOKEN")
        tokens[token] = person
    return tokens


def callback_token(person: str) -> str:
    """The token an MCP server sends back to /chat/events for one person's results."""
    key = settings.text_api_token.encode()
    return hmac.new(key, f"callback:{person}".encode(), hashlib.sha256).hexdigest()


@dataclass(frozen=True)
class Caller:
    """A request that passed the token check. `person` is None for the service token,
    which may act for anyone; otherwise every request acts for `person`."""

    person: str | None

    def acts_for(self, named: object) -> str | None:
        return user_id(named) if self.person is None else self.person


def check(
    path: str, bearer: str, query_user: str | None, user_tokens: dict[str, str]
) -> Caller | None:
    """The caller a bearer token makes, or None when it may not reach `path`."""
    given = bearer.encode()
    if hmac.compare_digest(given, settings.text_api_token.encode()):
        return Caller(None)
    if not path.startswith("/chat"):
        return None
    for token, person in user_tokens.items():
        if hmac.compare_digest(given, token.encode()):
            return Caller(person)
    if path == "/chat/events" and (person := user_id(query_user)):
        if hmac.compare_digest(given, callback_token(person).encode()):
            return Caller(person)
    return None
