import json
import os
import shutil
import tempfile
import unittest

from presence import store

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EXAMPLE = os.path.join(ROOT, "config", "accounts.example.json")


def make_workspace():
    root = tempfile.mkdtemp(prefix="presence-test-")
    os.makedirs(os.path.join(root, "config"))
    shutil.copyfile(EXAMPLE, os.path.join(root, "config", "accounts.example.json"))
    workspace = store.Workspace(root)
    workspace.example_path = os.path.join(root, "config", "accounts.example.json")
    return workspace


class ConfigTests(unittest.TestCase):
    def test_falls_back_to_example(self):
        workspace = make_workspace()
        accounts = workspace.load_config()
        self.assertGreater(len(accounts["platforms"]), 1)

    def test_save_creates_backup(self):
        workspace = make_workspace()
        accounts = workspace.load_config()
        workspace.save_config(accounts)
        workspace.save_config(accounts)
        backups = [n for n in os.listdir(workspace.backups_dir) if n.startswith("accounts-")]
        self.assertEqual(len(backups), 1)

    def test_save_rejects_invalid(self):
        workspace = make_workspace()
        with self.assertRaises(Exception):
            workspace.save_config({"schema_version": 1, "platforms": []})

    def test_backups_are_capped(self):
        workspace = make_workspace()
        accounts = workspace.load_config()
        workspace.save_config(accounts)
        for i in range(25):
            workspace.save_config(accounts)
        backups = [n for n in os.listdir(workspace.backups_dir) if n.startswith("accounts-")]
        self.assertLessEqual(len(backups), 20)

    def test_atomic_write_leaves_no_tmp(self):
        workspace = make_workspace()
        workspace.save_config(workspace.load_config())
        self.assertFalse(os.path.exists(workspace.config_path + ".tmp"))


class StateTests(unittest.TestCase):
    def test_state_merges_fresh_metrics(self):
        workspace = make_workspace()
        accounts = workspace.load_config()
        state = workspace.build_state(accounts, {"github": {"followers": 5}}, ts="2026-01-01T00:00:00+00:00")
        github = [p for p in state["platforms"] if p["id"] == "github"][0]
        self.assertEqual(github["metrics"]["followers"], 5)
        self.assertEqual(state["counts"]["auto_ok"], 1)

    def test_deltas_and_series_use_history(self):
        workspace = make_workspace()
        accounts = workspace.load_config()
        workspace.append_history("2026-01-01T00:00:00+00:00", {"github": {"followers": 3}})
        state = workspace.build_state(accounts, {"github": {"followers": 7}}, ts="2026-01-02T00:00:00+00:00")
        github = [p for p in state["platforms"] if p["id"] == "github"][0]
        self.assertEqual(github["delta"]["followers"], 4)
        self.assertEqual([point["v"] for point in github["series"]], [3])

    def test_empty_metrics_do_not_write_history(self):
        workspace = make_workspace()
        workspace.append_history("2026-01-01T00:00:00+00:00", {})
        self.assertEqual(workspace.history(), [])

    def test_unknown_platform_keeps_previous_metric(self):
        workspace = make_workspace()
        accounts = workspace.load_config()
        workspace.append_history("2026-01-01T00:00:00+00:00", {"github": {"followers": 3}})
        state = workspace.build_state(accounts, {}, errors={"github": "boom"})
        github = [p for p in state["platforms"] if p["id"] == "github"][0]
        self.assertEqual(github["metrics"]["followers"], 3)
        self.assertEqual(github["error"], "boom")


    def test_manual_metrics_fill_missing_data(self):
        workspace = make_workspace()
        accounts = workspace.load_config()
        accounts["platforms"][0]["manual_metrics"] = {
            "values": {"followers": 42}, "as_of": "2026-09-20"}
        state = workspace.build_state(accounts)
        github = [p for p in state["platforms"] if p["id"] == "github"][0]
        self.assertEqual(github["metrics"]["followers"], 42)
        self.assertEqual(github["metrics_source"], "manual")
        self.assertEqual(github["metrics_as_of"], "2026-09-20")

    def test_manual_snapshot_is_recorded_once(self):
        workspace = make_workspace()
        accounts = workspace.load_config()
        accounts["platforms"][0]["manual_metrics"] = {
            "values": {"followers": 42}, "as_of": "2026-09-20"}
        workspace.save_config(accounts)
        workspace.save_config(accounts)
        rows = [r for r in workspace.history() if "github" in r.get("metrics", {})]
        self.assertEqual(len(rows), 1)

    def test_last_collection_is_reported(self):
        workspace = make_workspace()
        accounts = workspace.load_config()
        workspace.append_history("2026-10-01T09:00:00+00:00", {"github": {"followers": 1}})
        state = workspace.build_state(accounts)
        self.assertEqual(state["last_collection"], "2026-10-01T09:00:00+00:00")

    def test_csv_export(self):
        workspace = make_workspace()
        accounts = workspace.load_config()
        state = workspace.build_state(accounts, {"github": {"followers": 12}})
        text = workspace.to_csv(state)
        self.assertIn("platform,handle,tracking,metric,value", text)
        self.assertIn("GitHub,acme-studio,auto,followers,12", text)
