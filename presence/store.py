"""Presence — persistence: atomic writes, backups, history."""
from __future__ import annotations

import csv
import io
import json
import os
import shutil
from datetime import datetime, timezone

from . import models


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def read_json(path: str, default=None):
    if not os.path.exists(path):
        return default
    with open(path, encoding="utf-8") as handle:
        return json.load(handle)


def write_json(path: str, obj) -> None:
    directory = os.path.dirname(os.path.abspath(path))
    os.makedirs(directory, exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as handle:
        json.dump(obj, handle, ensure_ascii=False, indent=2)
        handle.write("\n")
        handle.flush()
        os.fsync(handle.fileno())
    os.replace(tmp, path)


class Workspace:
    """A directory holding config, collected data, history and backups."""

    def __init__(self, root: str):
        self.root = os.path.abspath(root)
        self.config_path = os.path.join(self.root, "accounts.json")
        self.example_path = os.path.join(self.root, "accounts.example.json")
        if not os.path.exists(self.example_path):
            for fallback in (
                os.path.join(self.root, "config", "accounts.example.json"),
                os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", "accounts.example.json"),
            ):
                if os.path.exists(fallback):
                    self.example_path = fallback
                    break
        self.data_path = os.path.join(self.root, "data.json")
        self.history_path = os.path.join(self.root, "history.jsonl")
        self.backups_dir = os.path.join(self.root, "backups")

    # -- config ---------------------------------------------------------
    def load_config(self) -> dict:
        path = self.config_path if os.path.exists(self.config_path) else self.example_path
        return models.load(path)

    def save_config(self, doc: dict) -> dict:
        problems = models.validate(doc)
        if problems:
            raise models.ConfigError(problems)
        doc = models.normalize(doc)
        if os.path.exists(self.config_path):
            self._backup_config()
        write_json(self.config_path, doc)
        self.record_manual_metrics(doc["platforms"])
        return doc

    def record_manual_metrics(self, platforms: list[dict]) -> None:
        """Turn dated manual snapshots into history points, once per date."""
        history = self.history()
        seen = {(row.get("ts"), pid) for row in history for pid in row.get("metrics", {})}
        for p in platforms:
            manual = p.get("manual_metrics") or {}
            values = manual.get("values") or {}
            as_of = manual.get("as_of")
            if not values or not as_of:
                continue
            ts = as_of + "T12:00:00+00:00"
            if (ts, p["id"]) in seen:
                continue
            self.append_history(ts, {p["id"]: dict(values)})

    def _backup_config(self) -> str:
        os.makedirs(self.backups_dir, exist_ok=True)
        stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
        target = os.path.join(self.backups_dir, "accounts-%s.json" % stamp)
        shutil.copy2(self.config_path, target)
        names = sorted(n for n in os.listdir(self.backups_dir) if n.startswith("accounts-"))
        for name in names[:-20]:
            try:
                os.remove(os.path.join(self.backups_dir, name))
            except OSError:
                pass
        return target

    # -- history --------------------------------------------------------
    def history(self) -> list[dict]:
        if not os.path.exists(self.history_path):
            return []
        rows = []
        with open(self.history_path, encoding="utf-8") as handle:
            for line in handle:
                line = line.strip()
                if not line:
                    continue
                try:
                    rows.append(json.loads(line))
                except json.JSONDecodeError:
                    continue
        return rows

    def append_history(self, ts: str, metrics: dict) -> None:
        if not metrics:
            return
        with open(self.history_path, "a", encoding="utf-8") as handle:
            handle.write(json.dumps({"ts": ts, "metrics": metrics}, ensure_ascii=False) + "\n")

    # -- state ----------------------------------------------------------
    def build_state(self, accounts: dict, fresh: dict | None = None,
                    errors: dict | None = None, ts: str | None = None) -> dict:
        history = self.history()
        fresh = fresh or {}
        ts = ts or utc_now()
        errors = errors or {}
        platforms = []
        for p in accounts["platforms"]:
            pid = p["id"]
            series = []
            manual = (p.get("manual_metrics") or {})
            manual_values = manual.get("values") or {}
            latest = fresh.get(pid) or manual_values or self._previous(history, pid, ts)
            source = ("auto" if pid in fresh else
                      "manual" if manual_values else
                      "history" if latest else None)
            prev = self._previous(history, pid, ts)
            delta = {
                key: round(value - prev[key], 2)
                for key, value in latest.items()
                if isinstance(value, (int, float)) and isinstance(prev.get(key), (int, float))
            }
            key = PRIMARY.get(p.get("collector") or "") or (
                next(iter(manual_values), None) if manual_values else None)
            if key:
                for row in history:
                    if row.get("ts") and row["ts"] >= ts:
                        continue
                    value = (row.get("metrics", {}).get(pid) or {}).get(key)
                    if isinstance(value, (int, float)):
                        series.append({"ts": row.get("ts"), "v": value})
            platforms.append({
                **p,
                "metrics": latest,
                "delta": delta,
                "series": series[-60:],
                "error": errors.get(pid),
                "metrics_source": source,
                "metrics_as_of": manual.get("as_of") if source == "manual" else None,
                "health": models.health(p, bool(latest)),
            })
        stamps = [row.get("ts") for row in history if row.get("ts")]
        return {
            "generated_at": ts or utc_now(),
            "last_collection": max(stamps) if stamps else None,
            "brand": accounts.get("brand", {}),
            "counts": models.summarize(
                accounts["platforms"],
                {p["id"]: p for p in platforms if p["metrics"]},
                errors,
            ),
            "platforms": platforms,
            "history_points": len(history),
        }

    @staticmethod
    def _previous(history: list[dict], pid: str, before_ts: str | None = None) -> dict:
        for row in reversed(history):
            if before_ts and row.get("ts") and row["ts"] >= before_ts:
                continue
            metrics = row.get("metrics", {})
            if pid in metrics:
                return metrics[pid]
        return {}

    # -- export ---------------------------------------------------------
    @staticmethod
    def to_csv(state: dict) -> str:
        buffer = io.StringIO()
        writer = csv.writer(buffer)
        writer.writerow(["platform", "handle", "tracking", "metric", "value"])
        for p in state.get("platforms", []):
            for key, value in (p.get("metrics") or {}).items():
                if isinstance(value, (int, float)):
                    writer.writerow([p["name"], p["handle"], p["tracking"], key, value])
        return buffer.getvalue()


PRIMARY = {
    "github": "followers",
    "bluesky": "followers",
    "npm": "downloads_month",
    "huggingface": "followers",
    "discord": "members",
    "mastodon": "followers",
    "youtube": "subscribers",
    "twitch": "followers",
}
