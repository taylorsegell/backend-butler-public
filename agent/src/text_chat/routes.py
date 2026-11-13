"""The text chat's HTTP routes at /chat and the A2A endpoint they send to."""

from __future__ import annotations

import asyncio
import json
import logging
import secrets
from pathlib import Path
from typing import Any

import httpx
from fastapi import HTTPException, Request
from fastapi.responses import JSONResponse, PlainTextResponse, Response
from livekit.agents import AgentServer, AgentSession
from livekit.agents.a2a import A2ASessionContext

import approvals
import auth
from agent import HomeAssistantAgent
from config import UPDATE_PREFIX, settings
from conversations import A2A_ENDPOINT, conversations
from text_chat.chat import TextChat
from utils import build_llm

logger = logging.getLogger("ha-mcp-agent.text")

CHAT_PATH = "/chat"

# where the token check leaves the auth.Caller a request passed as
CALLER = "ha_livekit.caller"

_TRUE = ("1", "true", "yes")


def _person(request: Request, named: object) -> str | None:
    """Who a request acts for: the person its token belongs to, or for the service
    token, the one it names."""
    caller: auth.Caller = request.scope[CALLER]
    return caller.acts_for(named)


async def _json(request: Request) -> dict[str, Any]:
    """A JSON object body, or a 400 for anything else."""
    body = (await request.body()).decode().strip()
    try:
        data = json.loads(body or "{}")
    except ValueError:
        raise HTTPException(status_code=400, detail="body is not JSON") from None
    if not isinstance(data, dict):
        raise HTTPException(status_code=400, detail="body is not a JSON object")
    return data


def mount(server: AgentServer) -> None:
    """Serve the agent over A2A at /home-assistant, and the text bridge at /chat."""
    token = settings.text_api_token
    if not token:
        logger.warning("TEXT_API_TOKEN is not set, so the text chat endpoints are off")
        return

    chats: dict[str | None, TextChat] = {}

    def chat_of(user_id: str | None) -> TextChat:
        if user_id not in chats:
            chats[user_id] = TextChat(
                user_id,
                f"http://127.0.0.1:{settings.http_port}/{A2A_ENDPOINT}",
                headers={"Authorization": f"Bearer {token}"},
            )
        return chats[user_id]

    # All persistence happens in this process. RTC jobs authenticate as the service;
    # person tokens and browser-supplied ownership cannot acquire a lease.
    from voice_persistence import VoiceAuthority

    voice = VoiceAuthority(chat_of)

    @server.http.post("/chat/voice/{operation}")
    async def voice_storage(operation: str, request: Request) -> Response:
        if not secrets.compare_digest(
            request.headers.get("authorization", ""), f"Bearer {token}"
        ):
            raise HTTPException(403, "Service authentication required")
        if len(await request.body()) > 8 * 1024 * 1024:
            raise HTTPException(413, "Session snapshot is too large")
        data = await _json(request)
        person = _person(request, data.get("user"))
        if operation == "open":
            selected = data.get("conversation_id")
            if selected is not None and (
                not isinstance(selected, str) or len(selected) > 200
            ):
                raise HTTPException(400, "Invalid conversation id")
            return JSONResponse(await voice.open(person, selected))
        if operation not in ("snapshot", "release"):
            raise HTTPException(404, "Unknown operation")
        ident, lease = data.get("id"), data.get("lease")
        if not isinstance(ident, str) or not isinstance(lease, str):
            raise HTTPException(400, "Session id and lease required")
        return JSONResponse(
            await voice.update(
                person,
                ident,
                lease,
                data.get("record"),
                release=operation == "release",
                usage=data.get("usage"),
            )
        )

    @server.http.post(CHAT_PATH)
    async def chat(request: Request) -> Response:
        """Take `{"text", "new", "steps", "wait", "interrupt", "user"}` JSON or text.

        Answers 202 once the turn has started, and the answer goes to the person's
        phone; with `wait` it answers with the agent's reply instead."""
        async with voice.lock:
            await voice.expire()
        query = request.query_params
        if request.headers.get("content-type", "").startswith("application/json"):
            data = await _json(request)
            text = str(data.get("text") or "").strip()
        else:
            data = {}
            text = (await request.body()).decode().strip()
        renew = bool(data.get("new")) or query.get("new", "") in _TRUE
        steps = bool(data.get("steps", True)) and query.get("steps", "") not in (
            "0",
            "false",
            "no",
        )
        wait = bool(data.get("wait")) or query.get("wait", "") in _TRUE
        if not text and not renew:
            return PlainTextResponse("no text given", status_code=400)
        person_id = _person(request, data.get("user") or query.get("user"))
        if conversations.voice_busy(person_id):
            return PlainTextResponse(
                "This conversation is active; end the other session first",
                status_code=409,
            )
        person = chat_of(person_id)
        try:
            conversation_id, reply = await person.send(
                text,
                renew=renew,
                steps=steps,
                wait=wait,
                interrupt=bool(data.get("interrupt", True)),
            )
        except Exception as exc:
            logger.exception("text chat failed")
            return PlainTextResponse(f"[error] {exc}", status_code=502)
        return PlainTextResponse(
            reply,
            status_code=200 if wait or not text else 202,
            headers={"X-Conversation-Id": conversation_id},
        )

    @server.http.get(f"{CHAT_PATH}/history")
    async def chat_history(
        request: Request,
        limit: int = 200,
        user: str = "",
        conversation_id: str = "",
        version: str = "",
    ) -> JSONResponse:
        """A person's current conversation, or one they name, for a UI; `busy` while
        a turn runs, and only `unchanged` when it matches the `version` given."""
        history = await chat_of(_person(request, user)).history(
            limit, conversation_id or None, version
        )
        if history is None:
            return JSONResponse({"detail": "no such conversation"}, status_code=404)
        return JSONResponse(history)

    @server.http.get(f"{CHAT_PATH}/conversations")
    async def chat_conversations(request: Request, user: str = "") -> JSONResponse:
        """A person's conversations, latest first, and which one is current."""
        return JSONResponse(await chat_of(_person(request, user)).listing())

    @server.http.post(f"{CHAT_PATH}/switch")
    async def chat_switch(request: Request) -> JSONResponse:
        """Make `{"conversation_id", "user"}` the person's current conversation."""
        data = await _json(request)
        target = str(data.get("conversation_id") or "")
        return JSONResponse(
            {
                "switched": await chat_of(_person(request, data.get("user"))).switch(
                    target
                )
            }
        )

    @server.http.post(f"{CHAT_PATH}/delete")
    async def chat_delete(request: Request) -> JSONResponse:
        """Delete `{"conversation_id", "user"}`, a person's past conversation."""
        data = await _json(request)
        target = str(data.get("conversation_id") or "")
        return JSONResponse(
            {
                "deleted": await chat_of(_person(request, data.get("user"))).delete(
                    target
                )
            }
        )

    @server.http.post(f"{CHAT_PATH}/cancel")
    async def chat_cancel(request: Request) -> JSONResponse:
        """Stop a person's running turn's reply, answering at once: `{"task_id",
        "user"}`, the task from history or none for whichever runs; `"force": true`
        stops the tools it started as well."""
        data = await _json(request)
        person = chat_of(_person(request, data.get("user")))
        task_id = str(data.get("task_id") or "") or None
        cancelled = person.cancel(task_id, force=bool(data.get("force")))
        # a client cancels as the person starts to speak, so their message is coming
        return JSONResponse({"cancelled": cancelled, "warming": person.warm()})

    @server.http.post(f"{CHAT_PATH}/warm")
    async def chat_warm(request: Request) -> JSONResponse:
        """Load a person's current conversation ahead of their message: `{"user"}`."""
        data = await _json(request)
        return JSONResponse(
            {"warming": chat_of(_person(request, data.get("user"))).warm()}
        )

    approval_state = approvals.ApprovalStore(
        Path(settings.text_data_dir) / "approvals.json"
    )

    def approval_person(request: Request, named: object = None) -> str:
        person = _person(request, named)
        if not person:
            raise HTTPException(status_code=403, detail="a linked person is required")
        return person

    @server.http.get(f"{CHAT_PATH}/approval-events")
    async def approval_events(
        request: Request, user: str = "", after: int | None = None
    ) -> JSONResponse:
        # Job processes read this over loopback; no shared-memory assumption.
        return JSONResponse(
            approval_state.events(approval_person(request, user), after)
        )

    @server.http.get(f"{CHAT_PATH}/approvals")
    async def approval_list(request: Request, user: str = "") -> JSONResponse:
        person = approval_person(request, user)
        try:
            approval_state.reconcile(person, await approvals.bridge(person))
        except (httpx.HTTPError, ValueError, TypeError):
            logger.warning("Butler pending approvals unavailable")
            return JSONResponse(
                {"detail": "Butler approvals unavailable"}, status_code=502
            )
        return JSONResponse({"items": approval_state.items(person)})

    @server.http.post(f"{CHAT_PATH}/approvals")
    async def approval_decide(request: Request) -> JSONResponse:
        data = await _json(request)
        person = approval_person(request, data.get("user"))
        try:
            id, allow = approvals.decision(data)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from None
        try:
            await approvals.bridge(person, id=id, allow=allow)
        except httpx.HTTPStatusError as exc:
            status = 404 if exc.response.status_code == 404 else 502
            return JSONResponse(
                {
                    "detail": "Approval unavailable"
                    if status == 404
                    else "Butler decision failed"
                },
                status_code=status,
            )
        except (httpx.HTTPError, ValueError):
            return JSONResponse(
                {"detail": "Butler decision unavailable"}, status_code=502
            )
        approval_state.event(person, {"approval_result": {"id": id, "allow": allow}})
        return JSONResponse({"ok": True})

    updates: set[asyncio.Task[Any]] = set()

    @server.http.post(f"{CHAT_PATH}/events")
    async def chat_event(request: Request) -> Response:
        """Take a webhook's `{"source", "text"}` into a person's conversation as a turn
        the agent answers with no tools, e.g. a Claude Code task that finished."""
        data = await _json(request)
        text = str(data.get("text") or "").strip()
        if not text:
            return PlainTextResponse("no text given", status_code=400)
        person = chat_of(_person(request, request.query_params.get("user")))
        source = str(data.get("source") or "a webhook")
        if source == "butler":
            person_id = approval_person(request, request.query_params.get("user"))
            try:
                approval_state.event(person_id, data)
            except ValueError:
                return JSONResponse(
                    {"detail": "invalid approval event"}, status_code=400
                )
            approval_state.note(person_id, text)
        logger.info("update from %s: %s", source, text[:120])
        # answered in the background, so the sender is not held for a whole turn
        turn = asyncio.create_task(
            person.send(f"{UPDATE_PREFIX} {source}: {text}", interrupt=False)
        )
        updates.add(turn)
        turn.add_done_callback(updates.discard)
        return JSONResponse({"accepted": True}, status_code=202)

    # after the routes above: the A2A binding mounts a catch-all that shadows later ones
    @server.a2a_session(
        endpoint=A2A_ENDPOINT,
        description="Controls the home through Home Assistant.",
        idle_timeout=settings.text_idle_timeout,
    )
    async def serve(ctx: A2ASessionContext) -> None:
        if ctx.context_id in conversations.voice_live:
            raise RuntimeError("Conversation is leased by a voice session")
        session = AgentSession(llm=build_llm(), max_tool_steps=settings.max_tool_steps)
        agent = HomeAssistantAgent(user_id=conversations.owner(ctx.context_id))
        agent._suggest_replies_cb = conversations.suggested.setdefault(
            ctx.context_id, []
        ).extend
        # None when the caller names no conversation, which then lives in memory only
        # Reserve before asynchronous MCP setup, so voice cannot acquire a session
        # whose A2A handler has started but has not yet reached attach().
        conversations.live[ctx.context_id] = session
        try:
            await session.start(agent=agent, persist=ctx.persisted)
        except BaseException:
            conversations.live.pop(ctx.context_id, None)
            raise
        await conversations.attach(session, agent, ctx.context_id)
        ctx.attach(session)
