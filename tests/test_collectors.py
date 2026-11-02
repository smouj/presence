import unittest

from presence import collectors


def fake(mapping):
    def fetch(url):
        for key, value in mapping.items():
            if key in url:
                if isinstance(value, Exception):
                    raise value
                return value
        raise AssertionError("unexpected url: " + url)
    return fetch


class GithubTests(unittest.TestCase):
    def test_reads_user_and_stars(self):
        platform = {"handle": "acme"}
        fetch = fake({
            "/repos": [{"stargazers_count": 3}, {"stargazers_count": 4}],
            "/users/acme": {"followers": 10, "following": 2, "public_repos": 8},
        })
        self.assertEqual(collectors.github(platform, fetch),
                         {"followers": 10, "following": 2, "repos": 8, "stars": 7})


class NpmTests(unittest.TestCase):
    def test_sums_packages(self):
        platform = {"packages": ["a", "b"]}
        fetch = fake({"last-month/a": {"downloads": 5}, "last-month/b": {"downloads": 7}})
        result = collectors.npm(platform, fetch)
        self.assertEqual(result["downloads_month"], 12)
        self.assertEqual(result["failed"], 0)

    def test_all_failures_raise(self):
        platform = {"packages": ["a", "b"]}
        fetch = fake({"last-month/a": RuntimeError("down"), "last-month/b": RuntimeError("down")})
        with self.assertRaises(collectors.CollectError):
            collectors.npm(platform, fetch)

    def test_requires_packages(self):
        with self.assertRaises(collectors.CollectError):
            collectors.npm({}, fake({}))


class BlueskyTests(unittest.TestCase):
    def test_reads_profile(self):
        platform = {"handle": "acme.bsky.social"}
        fetch = fake({"getProfile": {"followersCount": 9, "followsCount": 4, "postsCount": 21}})
        self.assertEqual(collectors.bluesky(platform, fetch),
                         {"followers": 9, "following": 4, "posts": 21})


class DiscordTests(unittest.TestCase):
    def test_reads_invite_counts(self):
        platform = {"url": "https://discord.gg/abc"}
        fetch = fake({"invites/abc": {"approximate_member_count": 50,
                                      "approximate_presence_count": 7}})
        self.assertEqual(collectors.discord(platform, fetch), {"members": 50, "online": 7})


class MastodonTests(unittest.TestCase):
    def test_reads_account(self):
        platform = {"handle": "@acme", "url": "https://mastodon.social/@acme"}
        fetch = fake({"accounts/lookup": {"followers_count": 11, "following_count": 2,
                                          "statuses_count": 30}})
        self.assertEqual(collectors.mastodon(platform, fetch),
                         {"followers": 11, "following": 2, "posts": 30})


class CollectAllTests(unittest.TestCase):
    def test_isolates_failures(self):
        accounts = {"platforms": [
            {"id": "gh", "tracking": "auto", "collector": "github", "handle": "acme"},
            {"id": "bs", "tracking": "auto", "collector": "bluesky", "handle": "acme"},
            {"id": "manual", "tracking": "manual"},
            {"id": "bad", "tracking": "auto", "collector": "nope"},
        ]}
        fetch = fake({
            "/users/acme": {"followers": 1, "following": 0, "public_repos": 1},
            "/repos": [],
            "getProfile": RuntimeError("offline"),
        })
        metrics, errors = collectors.collect_all(accounts, fetch)
        self.assertIn("gh", metrics)
        self.assertNotIn("manual", metrics)
        self.assertIn("bs", errors)
        self.assertIn("unknown collector", errors["bad"])
