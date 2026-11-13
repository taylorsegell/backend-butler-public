"""RTC persistence through the HTTP authority; job workers never open SQLite.

Opaque, expiring leases prevent old/crashed workers overwriting a resumed session.
Only the HTTP process updates conversation ownership, history and the JSON index.
"""

from __future__ import annotations

import asyncio
import base64
import secrets
import time
from dataclasses import dataclass
from typing import Any

import httpx
from fastapi import HTTPException
from livekit.agents.llm import ChatContext, ChatItem
from livekit.agents.store.session import AgentRecord, SessionRecord
from pydantic import TypeAdapter

from config import settings
from conversations import conversations

_ITEMS = TypeAdapter(list[ChatItem])
TTL = 60.0


def pack(record: SessionRecord | None) -> dict | None:
    if record is None:
        return None
    return {
        "current_agent_id": record.current_agent_id,
        "userdata": record.userdata,
        "history": ChatContext(list(record.history)).to_dict(exclude_timestamp=False)[
            "items"
        ],
        "agents": [
            {
                "agent_id": a.agent_id,
                "cls": a.cls,
                "parent_agent_id": a.parent_agent_id,
                "state": a.state,
                "durable_state": base64.b64encode(a.durable_state).decode(),
                "chat_items": ChatContext(list(a.chat_items)).to_dict(
                    exclude_timestamp=False
                )["items"],
            }
            for a in record.agents.values()
        ],
    }


def unpack(data: dict | None) -> SessionRecord | None:
    if data is None:
        return None
    agents = {}
    for a in data["agents"]:
        item = AgentRecord(
            agent_id=a["agent_id"],
            cls=a["cls"],
            parent_agent_id=a.get("parent_agent_id"),
            state=a.get("state"),
            durable_state=base64.b64decode(a.get("durable_state", ""), validate=True),
            chat_items=_ITEMS.validate_python(a["chat_items"]),
        )
        agents[item.agent_id] = item
    return SessionRecord(
        current_agent_id=data.get("current_agent_id"),
        userdata=data.get("userdata"),
        history=_ITEMS.validate_python(data["history"]),
        agents=agents,
    )


@dataclass
class Lease:
    person: str
    token: str
    stored: Any
    deadline: float


class VoiceAuthority:
    def __init__(self, chats):
        self.chats = chats
        self.leases: dict[str, Lease] = {}
        self.lock = asyncio.Lock()
        self.watchdogs: set[asyncio.Task] = set()

    async def watch(self, ident, token):
        while True:
            await asyncio.sleep(5)
            async with self.lock:
                lease = self.leases.get(ident)
                if not lease or lease.token != token:
                    return
                if lease.deadline <= time.monotonic():
                    await self._release(ident)
                    return

    async def expire(self):
        for ident, lease in list(self.leases.items()):
            if lease.deadline <= time.monotonic():
                await self._release(ident)

    async def _release(self, ident):
        lease = self.leases[ident]
        await lease.stored.release()
        del self.leases[ident]
        conversations.voice_live.pop(ident, None)
        conversations._read.pop(ident, None)

    async def open(self, person, selected):
        if not person:
            raise HTTPException(403, "Link a person before saving a conversation")
        async with self.lock:
            await self.expire()
            if conversations.voice_busy(person):
                raise HTTPException(
                    409, "This conversation is already open in another session"
                )
            chat = self.chats(person)
            if chat.busy or chat._lock.locked():
                raise HTTPException(409, "Finish the current reply before connecting")
            async with chat._lock:
                if selected and not conversations.owns(person, selected):
                    raise HTTPException(404, "Conversation not found")
                await chat._close_client()
                ident = selected or conversations.current(person)
                if ident and ident in conversations.live:
                    raise HTTPException(409, "The previous session is still closing")
                if not ident:
                    ident = await conversations.create(person)
                stored = conversations.stored(ident)
                # Reserve before the first I/O so concurrent history requests and
                # A2A startup cannot load the same session during acquisition.
                conversations.voice_live[ident] = []
                try:
                    record = await stored.load()
                except BaseException:
                    conversations.voice_live.pop(ident, None)
                    await stored.release()
                    raise
                token = secrets.token_urlsafe(32)
                self.leases[ident] = Lease(
                    person, token, stored, time.monotonic() + TTL
                )
                conversations.voice_live[ident] = list(record.history) if record else []
                conversations.set_current(person, ident)
                task = asyncio.create_task(self.watch(ident, token))
                self.watchdogs.add(task)
                task.add_done_callback(self.watchdogs.discard)
                return {
                    "id": ident,
                    "lease": token,
                    "record": pack(record),
                    "usage": conversations.usage(ident),
                }

    async def update(self, person, ident, token, data, release=False, usage=None):
        async with self.lock:
            await self.expire()
            lease = self.leases.get(ident)
            if (
                not lease
                or lease.person != person
                or not secrets.compare_digest(lease.token, token)
            ):
                raise HTTPException(409, "Voice session expired; reconnect to continue")
            if usage is not None and (
                not isinstance(usage, dict)
                or set(usage) != {"input", "output", "cached"}
                or any(
                    type(v) is not int or not 0 <= v <= 10**18 for v in usage.values()
                )
            ):
                raise HTTPException(400, "Invalid usage totals")
            if data is not None:
                try:
                    record = unpack(data)
                except (ValueError, KeyError, TypeError) as exc:
                    raise HTTPException(400, "Invalid session record") from exc
                if record is None:
                    raise HTTPException(400, "Missing session record")
                await lease.stored.save(
                    current_agent_id=record.current_agent_id,
                    userdata=record.userdata,
                    history=record.history,
                    agents=list(record.agents.values()),
                )
                conversations.voice_live[ident] = list(record.history)
                title = next(
                    (
                        i.text_content
                        for i in record.history
                        if i.type == "message" and i.role == "user" and i.text_content
                    ),
                    "",
                )
                conversations.record(ident, title)
            if usage is not None:
                conversations.set_usage(ident, usage)
            lease.deadline = time.monotonic() + TTL
            if release:
                await self._release(ident)
            return {"ok": True}


class RemoteSession:
    """StoredSession protocol implemented over authenticated local HTTP."""

    def __init__(self, person: str, response: dict):
        self.person = person
        self.session_id = self.database_id = response["id"]
        self.token = response["lease"]
        self.record = unpack(response["record"])
        self.earlier_usage = dict(response.get("usage") or {})
        self.usage = None
        self._child_contexts: dict[str, str] = {}
        self._lock = asyncio.Lock()
        self.closed = False

    @staticmethod
    async def request(path: str, data: dict):
        async with httpx.AsyncClient(timeout=20) as client:
            response = await client.post(
                f"http://127.0.0.1:{settings.http_port}/chat/voice/{path}",
                headers={"Authorization": f"Bearer {settings.text_api_token}"},
                json=data,
            )
            response.raise_for_status()
            return response.json()

    @classmethod
    async def open(cls, person, selected):
        data = await cls.request("open", {"user": person, "conversation_id": selected})
        return cls(person, data)

    async def load(self):
        return self.record

    def child_session(self, endpoint):
        return None

    async def _update(self, path, record=None):
        return await self.request(
            path,
            {
                "user": self.person,
                "id": self.session_id,
                "lease": self.token,
                "record": record,
                "usage": self.usage,
            },
        )

    async def save(self, *, current_agent_id, userdata, history, agents):
        if not self.closed:
            record = SessionRecord(
                current_agent_id=current_agent_id,
                userdata=userdata,
                history=list(history),
                agents={a.agent_id: a for a in agents},
            )
            await self._update("snapshot", pack(record))

    async def heartbeat(self):
        while not self.closed:
            await asyncio.sleep(15)
            if not self.closed:
                await self._update("snapshot")

    async def release(self):
        if not self.closed:
            await self._update("release")
            self.closed = True
