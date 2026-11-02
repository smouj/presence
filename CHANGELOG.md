# Changelog

All notable changes to Presence are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [1.0.0] — 2026-11-02

### Added

- Account registry with priority, role, next action and per-platform setup checklist.
- Six public readers: GitHub, Bluesky, npm, Hugging Face, Discord and Mastodon.
- Dashboard with search, filters, setup health, deltas, sparklines and history chart.
- Side editor with three-state checklist (done / open / unknown).
- Atomic configuration saves with automatic backups and schema validation.
- CSV export and JSON API: state, config, collect, health.
- Null-safe behaviour: a failed collection never overwrites good data.
- 38 unit and API tests, Python 3.11–3.13 CI.
