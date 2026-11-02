"""Presence — data model, validation and health scoring."""
from __future__ import annotations

import json
import re
from typing import Any

SCHEMA_VERSION = 1
TRACKING = {"auto", "manual"}
PRIORITIES = ("high", "medium", "low")
ID_RE = re.compile(r"^[a-z0-9][a-z0-9_-]{0,31}$")


class ConfigError(ValueError):
    """Raised when accounts.json does not satisfy the schema."""

    def __init__(self, errors: list[str]):
        self.errors = errors
        super().__init__("; ".join(errors))


def validate(doc: Any) -> list[str]:
    """Return a list of human-readable schema errors (empty means valid)."""
    errors: list[str] = []
    if not isinstance(doc, dict):
        return ["The document must be a JSON object."]

    if doc.get("schema_version") != SCHEMA_VERSION:
        errors.append("schema_version must be %d." % SCHEMA_VERSION)

    platforms = doc.get("platforms")
    if not isinstance(platforms, list) or not platforms:
        return errors + ["'platforms' must be a non-empty list."]

    seen: set[str] = set()
    for index, p in enumerate(platforms):
        where = "platforms[%d]" % index
        if not isinstance(p, dict):
            errors.append("%s must be an object." % where)
            continue

        pid = p.get("id")
        if not isinstance(pid, str) or not ID_RE.match(pid):
            errors.append("%s: id must match [a-z0-9][a-z0-9_-]{0,31}." % where)
            pid = where
        elif pid in seen:
            errors.append("%s: duplicate id '%s'." % (where, pid))
        else:
            seen.add(pid)

        for key in ("name", "handle", "url"):
            value = p.get(key)
            if not isinstance(value, str) or not value.strip():
                errors.append("%s: '%s' is required." % (pid, key))

        url = p.get("url")
        if isinstance(url, str) and url and not url.startswith(("https://", "http://")):
            errors.append("%s: url must start with http:// or https://." % pid)

        tracking = p.get("tracking", "manual")
        if tracking not in TRACKING:
            errors.append("%s: tracking must be 'auto' or 'manual'." % pid)
        if tracking == "auto" and not p.get("collector"):
            errors.append("%s: tracking 'auto' requires a collector." % pid)

        if "priority" in p and p["priority"] not in PRIORITIES:
            errors.append("%s: priority must be high, medium or low." % pid)

        checklist = p.get("checklist", [])
        if not isinstance(checklist, list):
            errors.append("%s: checklist must be a list." % pid)
        else:
            for j, item in enumerate(checklist):
                if not isinstance(item, dict) or not isinstance(item.get("item"), str):
                    errors.append("%s.checklist[%d]: needs a string 'item'." % (pid, j))
                    continue
                if item.get("done") not in (True, False, None):
                    errors.append("%s.checklist[%d]: 'done' must be true, false or null." % (pid, j))
    return errors


def load(path: str) -> dict:
    with open(path, encoding="utf-8") as handle:
        doc = json.load(handle)
    problems = validate(doc)
    if problems:
        raise ConfigError(problems)
    return normalize(doc)


def normalize(doc: dict) -> dict:
    """Fill optional fields without inventing facts."""
    doc.setdefault("brand", {})
    out = []
    for p in doc["platforms"]:
        item = dict(p)
        item.setdefault("category", "other")
        item.setdefault("tracking", "manual")
        item.setdefault("collector", None)
        item.setdefault("verified", False)
        item.setdefault("priority", "medium")
        item.setdefault("role", "")
        item.setdefault("next_action", "")
        item.setdefault("notes", "")
        item.setdefault("checklist", [])
        out.append(item)
    doc["platforms"] = out
    return doc


def health(platform: dict, collected: bool = False) -> dict:
    """A deterministic setup score: 70 checklist, 10 verified, 10 next action, 10 data."""
    items = platform.get("checklist") or []
    done = sum(1 for item in items if item.get("done") is True)
    total = len(items)
    checklist = round(70 * done / total) if total else 70
    score = checklist
    if platform.get("verified"):
        score += 10
    if platform.get("next_action"):
        score += 10
    if collected:
        score += 10
    score = max(0, min(100, score))
    return {
        "score": score,
        "checklist_done": done,
        "checklist_total": total,
        "open": total - done,
    }


def summarize(platforms: list[dict], metrics: dict, errors: dict | None = None) -> dict:
    auto = [p for p in platforms if p.get("tracking") == "auto"]
    auto_ids = [p["id"] for p in auto]
    errors = errors or {}
    auto_ok = sum(1 for pid in auto_ids if pid in metrics)
    auto_error = sum(1 for pid in auto_ids if pid in errors and pid not in metrics)
    items = [item for p in platforms for item in (p.get("checklist") or [])]
    scores = [health(p, p["id"] in metrics)["score"] for p in platforms]
    return {
        "total": len(platforms),
        "auto": len(auto),
        "manual": len(platforms) - len(auto),
        "auto_ok": auto_ok,
        "auto_error": auto_error,
        "auto_pending": len(auto_ids) - auto_ok - auto_error,
        "checklist_total": len(items),
        "checklist_done": sum(1 for item in items if item.get("done") is True),
        "checklist_open": sum(1 for item in items if item.get("done") is not True),
        "health": round(sum(scores) / len(scores)) if scores else 0,
    }
