"""Owner-bound RTC leases use the HTTP store and survive worker loss/resume."""

import asyncio
import tempfile
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from fastapi import HTTPException
from livekit.agents.llm import ChatMessage, FunctionCall, FunctionCallOutput
from livekit.agents.store.session import AgentRecord, SessionRecord

import voice_persistence as voice
from conversations import Conversations


class VoicePersistenceTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        from pathlib import Path

        self.conversations = Conversations(Path(self.directory.name))
        self.patch = patch.object(voice, "conversations", self.conversations)
        self.patch.start()
        self.addCleanup(self.patch.stop)
        self.chats = {}

        def chat(person):
            return self.chats.setdefault(
                person,
                SimpleNamespace(
                    busy=False, _lock=asyncio.Lock(), _close_client=AsyncMock()
                ),
            )

        self.authority = voice.VoiceAuthority(chat)

    async def asyncTearDown(self):
        for task in self.authority.watchdogs:
            task.cancel()
        await asyncio.gather(*self.authority.watchdogs, return_exceptions=True)
        for ident in list(self.authority.leases):
            await self.authority._release(ident)
        await self.conversations.store.aclose()

    async def test_snapshot_release_and_resume_preserve_context_and_tools(self):
        opened = await self.authority.open("alice", None)
        items = [
            ChatMessage(role="user", content=["Turn on the desk light"]),
            FunctionCall(call_id="c", name="light", arguments='{"on":true}'),
            FunctionCallOutput(
                call_id="c", name="light", output="done", is_error=False
            ),
            ChatMessage(role="assistant", content=["The desk light is on."]),
        ]
        agent = AgentRecord(
            agent_id="butler",
            cls="agent:HomeAssistantAgent",
            chat_items=items,
            durable_state=b"\x80\xff\x00",
        )
        record = SessionRecord(
            current_agent_id="butler",
            userdata=None,
            history=items,
            agents={agent.agent_id: agent},
        )
        await self.authority.update(
            "alice", opened["id"], opened["lease"], voice.pack(record)
        )
        self.assertEqual(await self.conversations.items(opened["id"]), items)
        listed = await self.conversations.listing("alice")
        self.assertEqual(listed[0]["title"], "Turn on the desk light")
        await self.authority.update(
            "alice", opened["id"], opened["lease"], None, release=True
        )
        reopened = await self.authority.open("alice", opened["id"])
        restored = voice.unpack(reopened["record"])
        self.assertEqual(restored.history, items)
        self.assertEqual(list(restored.agents["butler"].chat_items), items)
        self.assertEqual(restored.agents["butler"].durable_state, b"\x80\xff\x00")

    async def test_foreign_selected_conversation_and_lease_are_rejected(self):
        opened = await self.authority.open("alice", None)
        for action in (
            self.authority.open("bob", opened["id"]),
            self.authority.update("bob", opened["id"], opened["lease"], None),
            self.authority.update("alice", opened["id"], "wrong", None),
            self.authority.open(None, None),
        ):
            with self.assertRaises(HTTPException):
                await action
        self.assertIsNone(self.conversations.current("bob"))

    async def test_live_lease_rejects_second_connection_and_recovers_expiry(self):
        opened = await self.authority.open("alice", None)
        with self.assertRaises(HTTPException) as caught:
            await self.authority.open("alice", None)
        self.assertEqual(caught.exception.status_code, 409)
        self.authority.leases[opened["id"]].deadline = 0
        resumed = await self.authority.open("alice", None)
        self.assertEqual(resumed["id"], opened["id"])
        self.assertNotEqual(resumed["lease"], opened["lease"])
        with self.assertRaises(HTTPException):
            await self.authority.update(
                "alice", opened["id"], opened["lease"], None, release=True
            )
        self.assertIn(resumed["id"], self.authority.leases)

    async def test_busy_text_session_cannot_be_taken_over(self):
        self.authority.chats("alice").busy = True
        with self.assertRaises(HTTPException) as caught:
            await self.authority.open("alice", None)
        self.assertEqual(caught.exception.status_code, 409)
        self.assertFalse(self.authority.leases)

    async def test_http_adapter_rehydrates_actual_sdk_agent_context(self):
        from livekit.agents import Agent, AgentSession

        opened = await self.authority.open("alice", None)
        messages = [
            ChatMessage(role="user", content=["Remember my desk light"]),
            ChatMessage(role="assistant", content=["I will remember it."]),
        ]
        record = SessionRecord(
            current_agent_id=None, userdata=None, history=messages, agents={}
        )
        await self.authority.update(
            "alice", opened["id"], opened["lease"], voice.pack(record), release=True
        )

        async def request(path, data):
            if path == "open":
                return await self.authority.open(data["user"], data["conversation_id"])
            return await self.authority.update(
                data["user"],
                data["id"],
                data["lease"],
                data["record"],
                release=path == "release",
                usage=data["usage"],
            )

        with patch.object(voice.RemoteSession, "request", side_effect=request):
            remote = await voice.RemoteSession.open("alice", opened["id"])
            agent = Agent(instructions="Be helpful", id="butler")
            session = AgentSession()
            # Skip media/model startup only; run the real SDK persistence rehydrate.
            with patch.object(session, "_start", new=AsyncMock()):
                await session.start(agent, persist=remote)
            self.assertEqual(list(session.history.items), messages)
            self.assertEqual(
                [i.text_content for i in agent.chat_ctx.items],
                [i.text_content for i in messages],
            )
            await remote.release()


class VoiceRouteTests(unittest.IsolatedAsyncioTestCase):
    async def test_service_only_and_owner_identity_are_enforced(self):
        import httpx
        from fastapi import FastAPI

        import auth
        from text_chat import routes

        app = FastAPI()

        @app.middleware("http")
        async def caller(request, call_next):
            request.scope[routes.CALLER] = auth.Caller(None)
            return await call_next(request)

        authority = SimpleNamespace(
            open=AsyncMock(return_value={"id": "owned"}),
            update=AsyncMock(return_value={"ok": True}),
        )
        server = SimpleNamespace(http=app, a2a_session=lambda **_: lambda f: f)
        with patch.object(voice, "VoiceAuthority", return_value=authority):
            routes.mount(server)
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as client:
            response = await client.post("/chat/voice/open", json={"user": "alice"})
            self.assertEqual(response.status_code, 403)
            authority.open.assert_not_awaited()
            response = await client.post(
                "/chat/voice/open",
                headers={"Authorization": f"Bearer {routes.settings.text_api_token}"},
                json={"user": "ALICE", "conversation_id": "selected"},
            )
            self.assertEqual(response.status_code, 200)
            authority.open.assert_awaited_once_with("alice", "selected")


if __name__ == "__main__":
    unittest.main()
