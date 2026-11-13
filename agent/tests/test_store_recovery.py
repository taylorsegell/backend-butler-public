"""Restore real conversation storage in a fresh process, without cloud credentials."""

import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

_RECOVERY_PROCESS = r'''
import asyncio
import json
import sys
from types import SimpleNamespace
from unittest.mock import AsyncMock

from fastapi import HTTPException
from livekit.agents.llm import ChatMessage
from livekit.agents.store.session import SessionRecord

from conversations import conversations
from voice_persistence import VoiceAuthority, pack, unpack

async def main():
    chats = {}
    def chat(person):
        return chats.setdefault(person, SimpleNamespace(
            busy=False, _lock=asyncio.Lock(), _close_client=AsyncMock()))
    authority = VoiceAuthority(chat)
    try:
        if sys.argv[1] == 'create':
            opened = await authority.open('alice', None)
            messages = [ChatMessage(role='user',
                content=['Synthetic recovery marker'])]
            record = SessionRecord(current_agent_id=None, userdata=None, agents={},
                history=messages)
            await authority.update('alice', opened['id'], opened['lease'], pack(record),
                usage={'input': 10, 'output': 2, 'cached': 0}, release=True)
        else:
            ident = conversations.current('alice')
            assert ident and conversations.current('bob') is None
            try:
                await authority.open('bob', ident)
            except HTTPException as error:
                assert error.status_code == 404
            else:
                raise AssertionError('Restored ownership was lost')
            opened = await authority.open('alice', ident)
            record = unpack(opened['record'])
            assert record.history[0].text_content == 'Synthetic recovery marker'
            assert opened['usage'] == {'input': 10, 'output': 2, 'cached': 0}
            try:
                await authority.update('alice', ident, 'stale-process-lease', None)
            except HTTPException as error:
                assert error.status_code == 409
            else:
                raise AssertionError('A stale process lease was accepted')
            await authority.update('alice', ident, opened['lease'], None, release=True)
        print(json.dumps({'id': opened['id']}))
    finally:
        for task in list(authority.watchdogs):
            task.cancel()
        await asyncio.gather(*authority.watchdogs, return_exceptions=True)
        await conversations.store.aclose()

asyncio.run(main())
'''


def test_closed_backup_restores_history_usage_and_ownership_in_fresh_process(tmp_path):
    source = tmp_path / "source"
    backup = tmp_path / "backup"
    restored = tmp_path / "restored"
    script = tmp_path / "recover.py"
    script.write_text(_RECOVERY_PROCESS)
    src = Path(__file__).resolve().parents[1] / "src"

    def run(mode, directory):
        env = dict(os.environ, TEXT_DATA_DIR=str(directory), PYTHONPATH=str(src))
        result = subprocess.run(
            [sys.executable, str(script), mode],
            env=env,
            check=True,
            capture_output=True,
            text=True,
            timeout=20,
        )
        return json.loads(result.stdout)

    saved = run("create", source)
    shutil.copytree(source, backup)
    shutil.rmtree(source)
    shutil.copytree(backup, restored)
    assert run("restore", restored) == saved
