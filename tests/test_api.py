import json
import os
import shutil
import tempfile
import threading
import unittest
import urllib.error
import urllib.request

from presence import server, store

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EXAMPLE = os.path.join(ROOT, "config", "accounts.example.json")


class ApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.root = tempfile.mkdtemp(prefix="presence-api-")
        cls.workspace = store.Workspace(cls.root)
        shutil.copyfile(EXAMPLE, cls.workspace.example_path)
        shutil.copyfile(EXAMPLE, cls.workspace.config_path)
        cls.httpd = server.make_server(cls.root, "127.0.0.1", 0)
        cls.port = cls.httpd.server_address[1]
        cls.thread = threading.Thread(target=cls.httpd.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()
        cls.httpd.server_close()
        shutil.rmtree(cls.root, ignore_errors=True)

    def url(self, path):
        return "http://127.0.0.1:%d%s" % (self.port, path)

    def get(self, path):
        with urllib.request.urlopen(self.url(path), timeout=5) as response:
            return response.status, response.read().decode()

    def put(self, path, payload):
        request = urllib.request.Request(
            self.url(path), data=json.dumps(payload).encode(), method="PUT",
            headers={"Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(request, timeout=5) as response:
                return response.status, json.loads(response.read().decode())
        except urllib.error.HTTPError as exc:
            return exc.code, json.loads(exc.read().decode())

    def test_health(self):
        status, body = self.get("/api/health")
        self.assertEqual(status, 200)
        self.assertEqual(json.loads(body)["name"], "presence")

    def test_state_has_accounts_and_data(self):
        status, body = self.get("/api/state")
        payload = json.loads(body)
        self.assertEqual(status, 200)
        self.assertTrue(payload["ok"])
        self.assertGreater(len(payload["accounts"]["platforms"]), 1)
        self.assertIn("counts", payload["data"])

    def test_index_is_served(self):
        status, body = self.get("/")
        self.assertEqual(status, 200)
        self.assertIn("Presence", body)

    def test_invalid_config_is_rejected(self):
        status, payload = self.put("/api/config", {"schema_version": 1, "platforms": []})
        self.assertEqual(status, 422)
        self.assertFalse(payload["ok"])

    def test_valid_config_is_saved(self):
        with open(EXAMPLE, encoding="utf-8") as handle:
            doc = json.load(handle)
        doc["platforms"][0]["notes"] = "edited in test"
        status, payload = self.put("/api/config", doc)
        self.assertEqual(status, 200)
        self.assertTrue(payload["ok"])
        self.assertEqual(payload["config"]["platforms"][0]["notes"], "edited in test")

    def test_export_csv(self):
        status, body = self.get("/api/export.csv")
        self.assertEqual(status, 200)
        self.assertIn("platform,handle,tracking,metric,value", body)

    def test_unknown_route(self):
        with self.assertRaises(urllib.error.HTTPError) as ctx:
            self.get("/api/nope")
        self.assertEqual(ctx.exception.code, 404)
