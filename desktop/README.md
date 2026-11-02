# Presence desktop

A small Windows tray application that owns the local server:

- starts `presence serve` inside WSL when it opens;
- opens the panel in an Edge app window;
- keeps a tray icon with **Open**, **Update numbers now**, **Open data folder**,
  **Start with Windows** and **Quit**;
- stops the server when you choose **Quit**.

## Requirements

- Windows 10 or 11 with WSL2 and the `presence` CLI installed in a distro.
- Microsoft Edge (used for the app window; falls back to the default browser).
- No .NET SDK: it compiles with the in-box `csc.exe`.

## Build

```powershell
powershell -ExecutionPolicy Bypass -File desktop\build.ps1 -SourceDir C:\path\to\presence
```

The binary lands in `desktop\bin\Presence.exe`.

## Configure

Copy `config/presence.desktop.example.ini` next to the executable as
`presence.desktop.ini` and set your distro, workspace root, port and CLI path.

## Notes

Closing the app window keeps the tray running, like any tray application.
**Quit** stops the server and exits. The first launch opens the panel
automatically; later launches reuse a server that is already running.
