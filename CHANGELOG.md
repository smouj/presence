# Changelog

## [1.2.0] — 2026-11-02

### Added

- **Manual numbers**: every platform can store dated values typed by hand
  (`manual_metrics`), shown with their measurement date and stored in history.
- **Desktop app for Windows**: a tray application that starts the local server,
  opens the panel in an Edge app window, updates numbers from the tray and stops
  the server on quit. Built with the in-box `csc.exe`, no .NET SDK.
- `presence.exe --quit` for a clean shutdown.
- Icon set: application icon (`.ico`) for the executable, tray and shortcuts.

### Changed

- Copy rewritten for people, not developers: *Profile health*, *Accounts*,
  *Up to date*, *To fix*, *Live* and *Manual*.
- "Updated X ago" is now based on the last real collection.
- The state endpoint rebuilds from configuration and history, so manual numbers
  appear immediately after saving.

### Fixed

- Manual snapshots are recorded once per date, not on every save.

## [1.1.0] — 2026-11-02

### Added

- Brand icons for 15 networks, embedded in the page (no CDN, no runtime requests).
- Dark and light themes plus three accents, remembered in the browser.
- HUD with setup-health ring, live/error/pending/manual distribution and legend.
- Cards grouped by priority, with brand tiles, metric tiles, sparklines and setup bars.
- Deep links: `#p=<id>` opens an account; `?theme=` and `?accent=` set the look.
- Screenshots of both themes and the editor.

### Changed

- Statistics now separate collector **errors** from platforms that simply have no
  data yet, instead of counting both as failures.
- The interface is split into `index.html`, `app.css`, `app.js` and `icons.js`.

### Fixed

- Sparklines rendered as opaque wedges; they are now a line with an endpoint.
- The theme button drew a dot instead of a sun.
- A collector field (`failed`) leaked into the metric tiles.

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
