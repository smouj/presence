import json
import os
import unittest

from presence import models

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EXAMPLE = os.path.join(ROOT, "config", "accounts.example.json")


def example():
    with open(EXAMPLE, encoding="utf-8") as handle:
        return json.load(handle)


class ValidationTests(unittest.TestCase):
    def test_example_is_valid(self):
        self.assertEqual(models.validate(example()), [])

    def test_duplicate_ids_are_rejected(self):
        doc = example()
        doc["platforms"].append(dict(doc["platforms"][0]))
        errors = models.validate(doc)
        self.assertTrue(any("duplicate id" in e for e in errors))

    def test_missing_name_is_rejected(self):
        doc = example()
        doc["platforms"][0]["name"] = "  "
        self.assertTrue(any("'name' is required" in e for e in models.validate(doc)))

    def test_bad_tracking_is_rejected(self):
        doc = example()
        doc["platforms"][0]["tracking"] = "sometimes"
        self.assertTrue(any("tracking must be" in e for e in models.validate(doc)))

    def test_auto_requires_collector(self):
        doc = example()
        doc["platforms"][1]["collector"] = None
        self.assertTrue(any("requires a collector" in e for e in models.validate(doc)))

    def test_bad_url_is_rejected(self):
        doc = example()
        doc["platforms"][0]["url"] = "github.com/acme"
        self.assertTrue(any("url must start" in e for e in models.validate(doc)))

    def test_checklist_must_be_tristate(self):
        doc = example()
        doc["platforms"][0]["checklist"][0]["done"] = "yes"
        self.assertTrue(any("true, false or null" in e for e in models.validate(doc)))

    def test_empty_platforms(self):
        self.assertTrue(models.validate({"schema_version": 1, "platforms": []}))


class HealthTests(unittest.TestCase):
    def test_full_setup_scores_100(self):
        platform = {
            "verified": True,
            "next_action": "Ship it",
            "checklist": [{"item": "a", "done": True}, {"item": "b", "done": True}],
        }
        self.assertEqual(models.health(platform, collected=True)["score"], 100)

    def test_empty_checklist_does_not_punish(self):
        self.assertEqual(models.health({"checklist": []})["score"], 70)

    def test_open_items_lower_the_score(self):
        platform = {"checklist": [{"item": "a", "done": True}, {"item": "b", "done": False}]}
        self.assertEqual(models.health(platform)["score"], 35)

    def test_unknown_state_counts_as_open(self):
        platform = {"checklist": [{"item": "a", "done": None}]}
        health = models.health(platform)
        self.assertEqual(health["open"], 1)
        self.assertEqual(health["checklist_done"], 0)


class NormalizeTests(unittest.TestCase):
    def test_defaults_are_filled(self):
        doc = models.normalize({"schema_version": 1, "platforms": [{
            "id": "x", "name": "X", "handle": "@x", "url": "https://x.com/x"}]})
        platform = doc["platforms"][0]
        self.assertEqual(platform["tracking"], "manual")
        self.assertEqual(platform["priority"], "medium")
        self.assertEqual(platform["checklist"], [])
        self.assertIsNone(platform["collector"])
