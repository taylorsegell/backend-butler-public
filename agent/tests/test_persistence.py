"""A conversation survives being saved, released and read back by a fresh process.

This is the check to run after moving the livekit-agents pin: it goes through every
draft persistence API the text chat uses (LocalStore, StoredSession load / save /
release, SessionRecord.history) the way conversations.py does.
"""

import pytest
from livekit.agents.llm import ChatMessage

from conversations import Conversations


@pytest.mark.asyncio
async def test_a_saved_conversation_reads_back(tmp_path):
    first = Conversations(tmp_path)
    conversation_id = await first.create("alice")
    stored = first.stored(conversation_id)
    await stored.load()
    said = ChatMessage(role="user", content=["are the lights on?"])
    answer = ChatMessage(role="assistant", content=["the kitchen light is on"])
    await stored.save(
        current_agent_id=None, userdata={}, history=[said, answer], agents=[]
    )
    await stored.release()
    await first.store.aclose()

    # a new process: a new index and store over the same directory
    again = Conversations(tmp_path)
    assert again.current("alice") == conversation_id
    assert again.owns("alice", conversation_id)
    items = await again.items(conversation_id)
    assert [i.text_content for i in items] == [said.text_content, answer.text_content]
    await again.store.aclose()


@pytest.mark.asyncio
async def test_delete_removes_the_files(tmp_path):
    store = Conversations(tmp_path)
    conversation_id = await store.create("alice")
    await store.create("alice")  # a newer one becomes current, so the first can go
    await store.delete(conversation_id)
    assert not list((tmp_path / "sessions").glob(f"{conversation_id}.sqlite*"))
    assert not store.owns("alice", conversation_id)
    await store.store.aclose()
