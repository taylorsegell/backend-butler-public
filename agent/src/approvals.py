"""Person-scoped Butler approval state; only the bridge can authorize a change."""

from __future__ import annotations

import json
import os
import time
from datetime import datetime
from pathlib import Path
from typing import Any


def decision(body: Any) -> tuple[str, bool]:
    if (
        not isinstance(body, dict)
        or not isinstance(body.get("id"), str)
        or not body["id"].strip()
        or len(body["id"]) > 256
        or type(body.get("allow")) is not bool
    ):
        raise ValueError("id and boolean allow are required")
    return body["id"], body["allow"]


def validate_prompt(value: Any) -> dict:
    if not isinstance(value, dict):
        raise ValueError("invalid approval")
    for key in ("id", "chat_id", "title", "summary"):
        if not isinstance(value.get(key), str) or not value[key]:
            raise ValueError("invalid approval")
    preview = value.get("preview")
    if not isinstance(preview, dict):
        raise ValueError("invalid preview")
    if preview.get("kind") == "yaml":
        if not isinstance(preview.get("text"), str):
            raise ValueError("invalid YAML preview")
    elif preview.get("kind") == "diff":
        if not isinstance(preview.get("lines"), list) or any(
            not isinstance(line, dict)
            or line.get("op") not in (" ", "+", "-")
            or not isinstance(line.get("text"), str)
            for line in preview["lines"]
        ):
            raise ValueError("invalid diff preview")
    else:
        raise ValueError("invalid preview kind")
    expiry = value.get("expires_at")
    try:
        datetime.fromisoformat(expiry.replace("Z", "+00:00"))
    except (AttributeError, TypeError, ValueError):
        raise ValueError("invalid expiry") from None
    outline = value.get("outline", [])
    if not isinstance(outline, list) or any(
        not isinstance(section, dict)
        or not isinstance(section.get("label"), str)
        or not isinstance(section.get("items"), list)
        or any(not isinstance(item, str) for item in section["items"])
        for section in outline
    ):
        raise ValueError("invalid outline")
    # Drop bridge ownership/internal fields rather than returning them to the browser.
    return {
        k: value[k]
        for k in (
            "id",
            "chat_id",
            "title",
            "summary",
            "preview",
            "expires_at",
            "outline",
        )
        if k in value
    }


class ApprovalStore:
    """Single HTTP-process writer. Voice jobs read over HTTP, never this file.

    Keep at most 100 rows per person for one day; pending rows recover from Butler.
    """

    def __init__(self, path: Path):
        self.path = path
        self._data = json.loads(path.read_text()) if path.exists() else {}
        self._events: dict[str, list[dict]] = {}
        self._seq = 0

    def _save(self) -> None:
        cutoff = time.time() - 86400
        self._data = {
            person: dict(
                [
                    (key, row) for key, row in rows.items() if row["updated"] > cutoff
                ][-100:]
            )
            for person, rows in self._data.items()
        }
        self.path.parent.mkdir(parents=True, exist_ok=True)
        tmp = self.path.with_suffix(".tmp")
        tmp.write_text(json.dumps(self._data, ensure_ascii=False))
        os.chmod(tmp, 0o600)
        os.replace(tmp, self.path)

    def items(self, person: str) -> list[dict]:
        return [
            dict(row) for row in self._data.get(person, {}).values() if "preview" in row
        ]

    def event(self, person: str, data: dict) -> None:
        prompt = validate_prompt(data["approval"]) if "approval" in data else None
        result = data.get("approval_result")
        if result is not None:
            id, allow = decision(result)
        elif prompt:
            id = prompt["id"]
        else:
            return
        rows = self._data.setdefault(person, {})
        old = rows.get(id, {})
        row = {**old, **(prompt or {}), "updated": time.time()}
        if result is not None:
            # Duplicate callbacks cannot flip an already recorded final decision.
            row["status"] = (
                old.get("status")
                if old.get("status") in ("approved", "denied")
                else "approved"
                if allow
                else "denied"
            )
        else:
            row["status"] = old.get("status", "pending")
        rows[id] = row
        self._save()

    def note(self, person: str, text: str) -> None:
        self._seq += 1
        events = self._events.setdefault(person, [])
        events.append({"seq": self._seq, "text": text})
        del events[:-100]

    def events(self, person: str, after: int | None) -> dict:
        return {
            "cursor": self._seq,
            "events": [
                e
                for e in self._events.get(person, [])
                if after is not None and e["seq"] > after
            ],
        }

    def reconcile(self, person: str, pending: list[dict]) -> None:
        prompts = [validate_prompt(p) for p in pending]
        rows = self._data.setdefault(person, {})
        ids = {p["id"] for p in prompts}
        for row in rows.values():
            if row.get("status") == "pending" and row["id"] not in ids:
                row["status"] = "unavailable"
        for prompt in prompts:
            old = rows.get(prompt["id"], {})
            status = old.get("status")
            rows[prompt["id"]] = {
                **old,
                **prompt,
                "updated": time.time(),
                "status": status if status in ("approved", "denied") else "pending",
            }
        self._save()


async def bridge(person: str, *, id: str | None = None, allow: bool = False) -> Any:
    """Use the configured Butler transport, always supplying an owner."""
    import httpx

    import mcp_clients

    if not person:
        raise ValueError("a linked person is required")
    entry = next((e for e in mcp_clients._entries() if e.get("id") == "butler"), None)
    url = mcp_clients._url(entry) if entry else None
    if not url or not url.rstrip("/").endswith("/mcp"):
        raise ValueError("Butler bridge is not configured")
    headers = {
        k: expanded
        for k, v in (entry.get("headers") or {}).items()
        if (expanded := mcp_clients._expand(str(v))) is not None
    }
    base = url.rstrip("/")[:-4]
    async with httpx.AsyncClient(timeout=15) as client:
        response = await (
            client.get(
                f"{base}/api/approvals", params={"user": person}, headers=headers
            )
            if id is None
            else client.post(
                f"{base}/api/approval",
                json={"id": id, "allow": allow, "user": person},
                headers=headers,
            )
        )
        response.raise_for_status()
        result = response.json()
        if id is None and (
            not isinstance(result, list)
            or any(p.get("owner") != person for p in result if isinstance(p, dict))
        ):
            raise ValueError("invalid owner in bridge response")
        return result
