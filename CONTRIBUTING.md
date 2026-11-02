# Contributing

Thanks for taking the time to improve Presence. The project is deliberately
small: standard library only, no build step, no telemetry.

## Development

```bash
python -m unittest discover -s tests -v
python -m presence check
python -m presence serve
```

## Rules

- **No dependencies.** If a change needs a package, it needs a very good reason.
- **No publishing code.** Presence reads; it must never post, schedule or edit a
  remote profile.
- **No invented data.** A metric without a source is `unknown`, not an estimate.
- **Tests first.** A reader or a validation rule without a test is not done.
- Keep the API additive: new fields are optional with sane defaults.

## Adding a collector

1. Write a function `def name(platform, fetch) -> dict` in `presence/collectors.py`.
2. Register it in `COLLECTORS` and `REQUIRED_FIELDS`.
3. Add tests with a fake `fetch`; never hit the network in CI.
4. Document the required fields in the README table.

## Reporting a bug

Include the output of `presence check`, the Python version and what you expected.
Never paste real credentials.
