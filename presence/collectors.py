"""Presence — readers for public APIs.

Every collector receives a `fetch` callable so the network can be replaced in
tests. Collectors only read public data; none of them can publish.
"""
from __future__ import annotations

import json
import urllib.parse
import urllib.request
from typing import Callable

Fetcher = Callable[[str], object]

UA = "Presence/1.0 (+https://github.com/smouj/presence)"
TIMEOUT = 20


class CollectError(RuntimeError):
    """A platform could not be read."""


def fetch_json(url: str, timeout: int = TIMEOUT):
    request = urllib.request.Request(
        url, headers={"User-Agent": UA, "Accept": "application/json"}
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8", "replace"))


def _handle(platform: dict) -> str:
    handle = (platform.get("handle") or "").strip().lstrip("@")
    if not handle:
        raise CollectError("empty handle")
    return handle


def github(platform: dict, fetch: Fetcher) -> dict:
    user = fetch("https://api.github.com/users/" + urllib.parse.quote(_handle(platform)))
    repos = fetch(
        "https://api.github.com/users/%s/repos?per_page=100&type=owner"
        % urllib.parse.quote(_handle(platform))
    )
    stars = sum(int(r.get("stargazers_count") or 0) for r in repos if isinstance(r, dict))
    return {
        "followers": user.get("followers"),
        "following": user.get("following"),
        "repos": user.get("public_repos"),
        "stars": stars,
    }


def bluesky(platform: dict, fetch: Fetcher) -> dict:
    actor = platform.get("actor") or _handle(platform)
    data = fetch(
        "https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor="
        + urllib.parse.quote(actor)
    )
    return {
        "followers": data.get("followersCount"),
        "following": data.get("followsCount"),
        "posts": data.get("postsCount"),
    }


def npm(platform: dict, fetch: Fetcher) -> dict:
    packages = platform.get("packages") or []
    if not packages:
        raise CollectError("no packages configured")
    total = 0
    failed = 0
    detail = {}
    for name in packages:
        try:
            data = fetch(
                "https://api.npmjs.org/downloads/point/last-month/"
                + urllib.parse.quote(name, safe="@/")
            )
            value = int(data.get("downloads") or 0)
            detail[name] = value
            total += value
        except Exception:
            detail[name] = None
            failed += 1
    if failed == len(packages):
        raise CollectError("no package answered")
    return {"downloads_month": total, "packages": len(packages), "failed": failed, "detail": detail}


def huggingface(platform: dict, fetch: Fetcher) -> dict:
    author = platform.get("author") or _handle(platform)
    models = fetch("https://huggingface.co/api/models?author=%s&limit=100" % urllib.parse.quote(author))
    spaces = fetch("https://huggingface.co/api/spaces?author=%s&limit=100" % urllib.parse.quote(author))
    likes = sum(int(m.get("likes") or 0) for m in models if isinstance(m, dict))
    result = {"models": len(models), "spaces": len(spaces), "likes": likes, "followers": None}
    try:
        overview = fetch("https://huggingface.co/api/users/%s/overview" % urllib.parse.quote(author))
        result["followers"] = overview.get("numFollowers")
    except Exception:
        pass
    return result


def discord(platform: dict, fetch: Fetcher) -> dict:
    url = platform.get("url") or ""
    code = url.rstrip("/").split("/")[-1]
    if not code:
        raise CollectError("no invite code in url")
    data = fetch("https://discord.com/api/v9/invites/%s?with_counts=true" % urllib.parse.quote(code))
    return {
        "members": data.get("approximate_member_count"),
        "online": data.get("approximate_presence_count"),
    }


def mastodon(platform: dict, fetch: Fetcher) -> dict:
    instance = platform.get("instance") or urllib.parse.urlparse(platform.get("url") or "").netloc
    if not instance:
        raise CollectError("no instance configured")
    account = fetch(
        "https://%s/api/v1/accounts/lookup?acct=%s"
        % (instance, urllib.parse.quote(_handle(platform)))
    )
    return {
        "followers": account.get("followers_count"),
        "following": account.get("following_count"),
        "posts": account.get("statuses_count"),
    }


COLLECTORS = {
    "github": github,
    "bluesky": bluesky,
    "npm": npm,
    "huggingface": huggingface,
    "discord": discord,
    "mastodon": mastodon,
}

REQUIRED_FIELDS = {
    "github": ["handle"],
    "bluesky": ["handle"],
    "npm": ["packages"],
    "huggingface": ["handle"],
    "discord": ["url"],
    "mastodon": ["handle"],
}


def collect_all(accounts: dict, fetch: Fetcher = fetch_json):
    """Return (metrics_by_id, errors_by_id). One failure never hides another."""
    metrics: dict[str, dict] = {}
    errors: dict[str, str] = {}
    for platform in accounts.get("platforms", []):
        if platform.get("tracking") != "auto":
            continue
        name = platform.get("collector")
        collector = COLLECTORS.get(name or "")
        pid = platform.get("id", "?")
        if collector is None:
            errors[pid] = "unknown collector: %s" % name
            continue
        try:
            metrics[pid] = collector(platform, fetch)
        except Exception as exc:  # isolated on purpose
            errors[pid] = "%s: %s" % (type(exc).__name__, exc)
    return metrics, errors
