"""The conversation index: who owns what survives crashes and old layouts."""

import json

import pytest

from conversations import Conversations


def test_index_round_trips(tmp_path):
    store = Conversations(tmp_path)
    store._entry("c1")["user"] = "alice"
    store.set_current("alice", "c1")
    assert store.owns("alice", "c1")
    again = Conversations(tmp_path)
    assert again.current("alice") == "c1" and again.owns("alice", "c1")
    assert not (tmp_path / "conversations.json.tmp").exists()


def test_unreadable_index_is_never_overwritten(tmp_path):
    index = tmp_path / "conversations.json"
    index.write_text('{"conversations": {"c1": {"user": "ali')
    store = Conversations(tmp_path)
    with pytest.raises(RuntimeError):
        store.current("alice")
    assert index.read_text().endswith('"ali')


def test_old_flat_index_is_migrated(tmp_path):
    (tmp_path / "conversations.json").write_text(json.dumps({"c1": {"user": "alice"}}))
    (tmp_path / "current_conversation.alice").write_text("c1")
    store = Conversations(tmp_path)
    assert store.current("alice") == "c1" and store.owns("alice", "c1")
    assert not (tmp_path / "current_conversation.alice").exists()


def test_stamp_skips_files_that_vanish(tmp_path, monkeypatch):
    store = Conversations(tmp_path)
    sessions = tmp_path / "sessions"
    sessions.mkdir()
    (sessions / "c1.sqlite").write_text("x")
    (sessions / "c1.sqlite-wal").write_text("y")
    real_glob = type(sessions).glob

    def glob_then_vanish(self, pattern):
        found = list(real_glob(self, pattern))
        (sessions / "c1.sqlite-wal").unlink()
        return found

    monkeypatch.setattr(type(sessions), "glob", glob_then_vanish)
    assert len(store._stamp("c1")) == 2
