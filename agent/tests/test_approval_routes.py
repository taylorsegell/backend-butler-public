"""HTTP contract: pin caller identity, validate decisions, preserve bridge failures."""

import tempfile
import unittest
from dataclasses import replace
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import httpx
from fastapi import FastAPI

import auth
from text_chat import routes


class ApprovalRouteTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.bridge = AsyncMock(return_value=[])
        self.patchers = [
            patch.object(routes.approvals, "bridge", self.bridge),
            patch.object(
                routes,
                "settings",
                replace(routes.settings, text_data_dir=self.tmp.name),
            ),
            patch.object(
                routes.TextChat, "send", AsyncMock(return_value=("chat", "accepted"))
            ),
        ]
        for patcher in self.patchers:
            patcher.start()
            self.addCleanup(patcher.stop)
        app = FastAPI()

        @app.middleware("http")
        async def caller(request, call_next):
            request.scope[routes.CALLER] = auth.Caller(
                request.headers.get("x-test-person") or None
            )
            return await call_next(request)

        server = SimpleNamespace(http=app, a2a_session=lambda **_: lambda f: f)
        routes.mount(server)
        self.client = httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        )
        self.addAsyncCleanup(self.client.aclose)

    async def test_body_cannot_impersonate_another_person(self):
        self.bridge.return_value = {"ok": True}
        response = await self.client.post(
            "/chat/approvals",
            headers={"x-test-person": "alice"},
            json={"id": "a", "allow": False, "user": "bob"},
        )
        self.assertEqual(response.status_code, 200)
        self.bridge.assert_awaited_once_with("alice", id="a", allow=False)

    async def test_list_is_bound_to_person(self):
        response = await self.client.get(
            "/chat/approvals?user=bob", headers={"x-test-person": "alice"}
        )
        self.assertEqual(response.json(), {"items": []})
        self.bridge.assert_awaited_once_with("alice")

    async def test_unlinked_person_and_nonboolean_are_rejected(self):
        self.assertEqual((await self.client.get("/chat/approvals")).status_code, 403)
        response = await self.client.post(
            "/chat/approvals",
            headers={"x-test-person": "alice"},
            json={"id": "a", "allow": "false"},
        )
        self.assertEqual(response.status_code, 400)
        self.bridge.assert_not_awaited()

    async def test_expired_or_foreign_bridge_decision_stays_404(self):
        response = httpx.Response(
            404, request=httpx.Request("POST", "http://bridge/api/approval")
        )
        self.bridge.side_effect = httpx.HTTPStatusError(
            "missing", request=response.request, response=response
        )
        result = await self.client.post(
            "/chat/approvals",
            headers={"x-test-person": "alice"},
            json={"id": "gone", "allow": True},
        )
        self.assertEqual(result.status_code, 404)

    async def test_outage_does_not_claim_success(self):
        self.bridge.side_effect = httpx.ConnectError("offline")
        result = await self.client.get(
            "/chat/approvals", headers={"x-test-person": "alice"}
        )
        self.assertEqual(result.status_code, 502)
        result = await self.client.post(
            "/chat/approvals",
            headers={"x-test-person": "alice"},
            json={"id": "a", "allow": True},
        )
        self.assertEqual(result.status_code, 502)

    async def test_voice_feed_is_person_bound_and_does_not_replay_on_join(self):
        await self.client.post(
            "/chat/events?user=alice", json={"source": "butler", "text": "Done"}
        )
        baseline = await self.client.get("/chat/approval-events?user=alice")
        self.assertEqual(baseline.json()["events"], [])
        rows = await self.client.get("/chat/approval-events?user=alice&after=0")
        self.assertEqual(rows.json()["events"][0]["text"], "Done")
        bob = await self.client.get(
            "/chat/approval-events?user=alice&after=0", headers={"x-test-person": "bob"}
        )
        self.assertEqual(bob.json()["events"], [])
