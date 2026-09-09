# Legacy Recovery & Patch Scripts

This directory archives historical one-off repair, layout extraction, and patching scripts used during previous agent migrations.

> [!NOTE]
> These scripts are preserved for audit and historical reference only. They are not run during normal development or build pipelines.

## Active Project Scripts
For current development and building, use:
- `desktop.sh`: Starts the backend and Tauri dev window.
- `start.sh`: Starts the backend and Vite frontend for browser development.
- `scripts/rebuild-install-macos.sh`: Builds PyInstaller sidecar binary, Tauri native app, and installs to `/Applications/Canvenient.app`.
