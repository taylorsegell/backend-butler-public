"""Approval state remains person-bound and never reopens a decided request."""

import tempfile
import unittest
from pathlib import Path

from approvals import ApprovalStore, decision


def prompt(id="a"):
    return {
        "id": id,
        "chat_id": "chat",
        "title": "Test",
        "summary": "Change",
        "preview": {"kind": "yaml", "text": "alias: Test"},
        "expires_at": "2099-01-01T00:00:00.000Z",
    }


class ApprovalTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.path = Path(self.tmp.name) / "approvals.json"
        self.store = ApprovalStore(self.path)

    def test_isolation_and_persistence(self):
        self.store.event("alice", {"approval": prompt()})
        self.assertEqual(self.store.items("bob"), [])
        self.assertEqual(ApprovalStore(self.path).items("alice")[0]["id"], "a")

    def test_result_before_prompt_does_not_reopen(self):
        self.store.event("alice", {"approval_result": {"id": "a", "allow": False}})
        self.store.event("alice", {"approval": prompt()})
        self.assertEqual(self.store.items("alice")[0]["status"], "denied")

    def test_reconcile_disables_missing_and_preserves_preview(self):
        self.store.event("alice", {"approval": prompt()})
        self.store.reconcile("alice", [])
        row = self.store.items("alice")[0]
        self.assertEqual(row["status"], "unavailable")
        self.assertEqual(row["preview"]["text"], "alias: Test")

    def test_pending_can_recover_after_transient_missing_snapshot(self):
        self.store.event("alice", {"approval": prompt()})
        self.store.reconcile("alice", [])
        self.store.reconcile("alice", [prompt()])
        self.assertEqual(self.store.items("alice")[0]["status"], "pending")

    def test_refresh_never_reopens_decided(self):
        self.store.event("alice", {"approval": prompt()})
        self.store.event("alice", {"approval_result": {"id": "a", "allow": True}})
        self.store.reconcile("alice", [prompt()])
        self.assertEqual(self.store.items("alice")[0]["status"], "approved")

    def test_bad_callback_is_rejected(self):
        with self.assertRaises(ValueError):
            self.store.event("alice", {"approval": {"id": "a"}})
        self.assertEqual(self.store.items("alice"), [])

    def test_decision_requires_real_boolean_and_nonempty_id(self):
        for body in (
            {"id": "a", "allow": "false"},
            {"id": "", "allow": True},
            {"id": "a", "allow": 1},
            [],
        ):
            with self.assertRaises(ValueError):
                decision(body)
        self.assertEqual(decision({"id": "a", "allow": False}), ("a", False))


if __name__ == "__main__":
    unittest.main()
