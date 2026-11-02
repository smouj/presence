"""Presence — command line interface."""
from __future__ import annotations

import argparse
import os
import shutil
import sys

from . import __version__, collectors, models, server, store


def _workspace(path: str) -> store.Workspace:
    return store.Workspace(path)


def cmd_init(args) -> int:
    ws = _workspace(args.root)
    if os.path.exists(ws.config_path):
        print("accounts.json already exists at %s" % ws.config_path)
        return 1
    shutil.copyfile(ws.example_path, ws.config_path)
    print("created %s — edit it with your accounts" % ws.config_path)
    return 0


def cmd_check(args) -> int:
    ws = _workspace(args.root)
    try:
        accounts = ws.load_config()
    except models.ConfigError as exc:
        for problem in exc.errors:
            print("error: " + problem)
        return 1
    auto = [p for p in accounts["platforms"] if p["tracking"] == "auto"]
    print("ok: %d platforms, %d automatic, %d manual" % (
        len(accounts["platforms"]), len(auto), len(accounts["platforms"]) - len(auto)))
    for platform in auto:
        if platform.get("collector") not in collectors.COLLECTORS:
            print("error: %s uses unknown collector %r" % (platform["id"], platform.get("collector")))
            return 1
    return 0


def cmd_collect(args) -> int:
    ws = _workspace(args.root)
    accounts = ws.load_config()
    metrics, errors = collectors.collect_all(accounts)
    for pid, error in errors.items():
        print("fail %-14s %s" % (pid, error))
    if not metrics:
        print("no platform answered; data.json and history were left untouched")
        return 2
    ts = store.utc_now()
    ws.append_history(ts, metrics)
    state = ws.build_state(accounts, metrics, errors, ts)
    store.write_json(ws.data_path, state)
    for pid, values in metrics.items():
        print("ok   %-14s %s" % (pid, values))
    print("\nwrote %s" % ws.data_path)
    return 0


def cmd_export(args) -> int:
    ws = _workspace(args.root)
    state = ws.build_state(ws.load_config())
    text = ws.to_csv(state)
    if args.output:
        with open(args.output, "w", encoding="utf-8") as handle:
            handle.write(text)
        print("wrote %s" % args.output)
    else:
        sys.stdout.write(text)
    return 0


def cmd_serve(args) -> int:
    ws = _workspace(args.root)
    if not os.path.exists(ws.config_path):
        print("no accounts.json in %s — run: presence init" % ws.root, file=sys.stderr)
        return 1
    httpd = server.make_server(ws.root, args.host, args.port)
    print("Presence %s on http://%s:%d" % (__version__, args.host, args.port))
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nstopped")
    return 0


def main(argv=None) -> int:
    common = argparse.ArgumentParser(add_help=False)
    common.add_argument("--root", metavar="DIR", default=argparse.SUPPRESS,
                        help="workspace directory (default: current)")

    parser = argparse.ArgumentParser(
        prog="presence", parents=[common],
        description="Local-first social account control panel.")
    parser.add_argument("--version", action="version", version="presence " + __version__)
    sub = parser.add_subparsers(dest="command", required=True)

    item = sub.add_parser("init", parents=[common], help="create accounts.json from the example")
    item.set_defaults(func=cmd_init)

    item = sub.add_parser("check", parents=[common], help="validate accounts.json")
    item.set_defaults(func=cmd_check)

    item = sub.add_parser("collect", parents=[common], help="read public metrics and update data.json")
    item.set_defaults(func=cmd_collect)

    item = sub.add_parser("export", parents=[common], help="write a CSV of the latest metrics")
    item.add_argument("-o", "--output")
    item.set_defaults(func=cmd_export)

    item = sub.add_parser("serve", parents=[common], help="start the dashboard")
    item.add_argument("--host", default="127.0.0.1")
    item.add_argument("--port", type=int, default=8770)
    item.set_defaults(func=cmd_serve)

    args = parser.parse_args(argv)
    args.root = getattr(args, "root", ".")
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
