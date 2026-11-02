"""Presence — local HTTP server and JSON API."""
from __future__ import annotations

import json
import os
import time
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

from . import __version__, collectors, models, store

MAX_BODY = 512 * 1024
STARTED = time.time()


class Handler(SimpleHTTPRequestHandler):
    server_version = "Presence/" + __version__
    workspace: store.Workspace

    def log_message(self, fmt, *args):
        if args and str(args[1]).startswith(("4", "5")):
            print("%s - %s" % (self.address_string(), fmt % args))

    # -- helpers --------------------------------------------------------
    def _json(self, payload, status=200):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _error(self, status, message):
        self._json({"ok": False, "error": message}, status)

    # -- routes ---------------------------------------------------------
    def do_GET(self):
        path = self.path.split("?")[0]

        if path == "/api/health":
            return self._json({
                "ok": True,
                "name": "presence",
                "version": __version__,
                "uptime_seconds": round(time.time() - STARTED),
            })

        if path == "/api/state":
            try:
                accounts = self.workspace.load_config()
            except models.ConfigError as exc:
                return self._json({"ok": False, "errors": exc.errors}, 422)
            except Exception as exc:
                return self._error(500, str(exc))
            cached = store.read_json(self.workspace.data_path, {}) or {}
            data = cached if cached.get("platforms") else self.workspace.build_state(accounts)
            return self._json({"ok": True, "accounts": accounts, "data": data,
                               "now": store.utc_now()})

        if path == "/api/config":
            return self._json({"ok": True, "config": self.workspace.load_config()})

        if path == "/api/collectors":
            return self._json({"ok": True, "collectors": sorted(collectors.COLLECTORS),
                               "required": collectors.REQUIRED_FIELDS})

        if path == "/api/export.csv":
            try:
                state = self.workspace.build_state(self.workspace.load_config())
            except Exception as exc:
                return self._error(500, str(exc))
            body = self.workspace.to_csv(state).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "text/csv; charset=utf-8")
            self.send_header("Content-Disposition", 'attachment; filename="presence-metrics.csv"')
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            return self.wfile.write(body)

        if path == "/":
            self.path = "/index.html"
        name = os.path.basename(self.path)
        if os.path.splitext(name)[1].lower() not in {".html", ".css", ".js", ".svg", ".png", ".webp"}:
            return self._error(404, "not found")
        return SimpleHTTPRequestHandler.do_GET(self)

    def do_PUT(self):
        if self.path.split("?")[0] != "/api/config":
            return self._error(404, "not found")
        length = int(self.headers.get("Content-Length") or 0)
        if length <= 0 or length > MAX_BODY:
            return self._error(413, "empty or oversized body")
        try:
            doc = json.loads(self.rfile.read(length).decode("utf-8"))
        except Exception as exc:
            return self._error(400, "invalid JSON: %s" % exc)
        try:
            saved = self.workspace.save_config(doc)
        except models.ConfigError as exc:
            return self._json({"ok": False, "errors": exc.errors}, 422)
        except Exception as exc:
            return self._error(500, str(exc))
        return self._json({"ok": True, "config": saved})

    def do_POST(self):
        if self.path.split("?")[0] != "/api/collect":
            return self._error(404, "not found")
        started = time.time()
        try:
            accounts = self.workspace.load_config()
        except Exception as exc:
            return self._error(500, str(exc))
        metrics, errors = collectors.collect_all(accounts)
        if not metrics:
            return self._json({
                "ok": False,
                "seconds": round(time.time() - started, 1),
                "errors": errors,
                "data": store.read_json(self.workspace.data_path, {}),
            })
        ts = store.utc_now()
        self.workspace.append_history(ts, metrics)
        state = self.workspace.build_state(accounts, metrics, errors, ts)
        store.write_json(self.workspace.data_path, state)
        return self._json({
            "ok": not errors,
            "seconds": round(time.time() - started, 1),
            "errors": errors,
            "data": state,
        })


def make_server(root: str, host: str = "127.0.0.1", port: int = 8770,
                web_root: str | None = None) -> ThreadingHTTPServer:
    Handler.workspace = store.Workspace(root)
    directory = web_root or os.path.join(os.path.dirname(os.path.abspath(__file__)), "web")
    return ThreadingHTTPServer((host, port), partial(Handler, directory=directory))
