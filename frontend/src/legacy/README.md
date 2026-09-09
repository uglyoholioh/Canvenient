# Legacy Web App Components

> [!WARNING]
> **DO NOT IMPORT OR EDIT FILES IN THIS DIRECTORY.**
> These components belong to an older browser-based version of Canvenient and are archived here for historical reference only.
> They are **not** part of the active Tauri macOS application.

## Replacements & Architecture Map

| Legacy Web Component | Active Native Desktop Component | Description |
| :--- | :--- | :--- |
| `TaskManagerDashboard.jsx` | `src/components/Dashboard.jsx` + `src/components/dashboard/*` | The native 70/30 macOS workbench dashboard |
| `Settings.jsx` | `src/components/SettingsView.jsx` | Native settings with Graphite theme, shortcuts, Telegram bot link, etc. |
| `Sidebar.jsx`, `SlimSidebar.jsx` | `src/components/WorkspaceLayout.jsx` | Native macOS 48px icon rail / expandable sidebar |
| `TasksPage.jsx` | `src/components/TaskView.jsx` / `TasksModule.jsx` | Native tasks manager view & module |
| `AiBrief.jsx` | `src/components/dashboard/AiBriefModule.jsx` | Native AI Brief module for the workbench |
| `StudyTimer.jsx`, `FloatingStudyTimer.jsx` | `src/components/dashboard/StudyTimerModule.jsx` | Native popover timer in toolbar/dashboard |
| `TerminalWorkspace.jsx` | `src/components/WorkspaceLayout.jsx` | Workspace shell with native toolbar & rail |
| `Organisations.jsx`, `JoinGroupLink.jsx` | *None (Deprecated)* | Multi-user team features from early web version |
| `TodayHub.jsx` | `src/components/Dashboard.jsx` | Early day-overview experiment |
| `FileViewer.jsx` | `src/components/CanvasView.jsx` | File viewer now handled in Canvas Drawer |
| `OnboardingForm.jsx` | `src/components/RegisterForm.jsx` | Early multi-step onboarding |
| `drawers/NoteDrawer.jsx` | `src/components/NotesView.jsx` | Notes editing view |
| `fix_notice.py` | *None* | Scratch Python script |
