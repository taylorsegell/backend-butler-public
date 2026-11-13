"""Text chat with the Home Assistant agent: an A2A endpoint, and a plain-text bridge.

    POST /chat ──► bridge (A2AClient) ──► /home-assistant (A2A) ──► AgentSession
     plain text      TaskInput JSON        a context per conversation   persist → SQLite

Built on the draft session-persistence API of livekit-agents (livekit/agents#7465);
agent/pyproject.toml says how to move its pin. ``/home-assistant`` is an
``@server.a2a_session`` on the worker's own HTTP app: it runs in the main process,
with no room, LLM only. ``/chat`` turns a message into a ``TaskInput``, sends it there
over loopback, and turns the ``TaskUpdate`` stream back into text, so the wire format
stays the framework's. The agent is the conversation's only (front) session, so the
conversation id is the A2A context id.

A loaded session is saved as each chat item arrives, and once more when it closes:
after ``TEXT_IDLE_TIMEOUT``, when a new conversation replaces it, or on a graceful stop
(compose's ``stop_grace_period``). A crash loses at most the item being written, and
the next request loads the conversation back from SQLite.

A request names its person by ``user``, an id; none is no one in particular.
docs/text-chat.md has the API.
"""
