#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]
#![allow(unexpected_cfgs)]

use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::{Path, PathBuf},
    process::Command as SystemCommand,
    sync::Mutex,
};
use tauri::{
    api::process::{Command, CommandChild, CommandEvent},
    AboutMetadata, CustomMenuItem, GlobalShortcutManager, Manager, Menu, MenuItem,
    PhysicalPosition, PhysicalSize, State, Submenu, WindowEvent,
};

#[cfg(target_os = "macos")]
use {
    cocoa::{appkit::NSApp, base::id},
    objc::{
        msg_send,
        runtime::{class_addMethod, Class, Imp, Object, Sel},
        sel, sel_impl,
    },
    once_cell::sync::OnceCell,
    std::{ffi::CStr, os::raw::c_char},
};

const MAX_CALENDAR_BYTES: u64 = 10 * 1024 * 1024;

struct BackendProcess(Mutex<Option<CommandChild>>);
struct PendingCalendarFiles(Mutex<Vec<String>>);

#[derive(Clone, Debug, Deserialize, Serialize)]
struct WindowState {
    x: i32,
    y: i32,
    width: u32,
    height: u32,
    maximized: bool,
}

impl Default for WindowState {
    fn default() -> Self {
        Self {
            x: 120,
            y: 120,
            width: 1000,
            height: 700,
            maximized: false,
        }
    }
}

struct SavedWindowState {
    value: Mutex<WindowState>,
    path: PathBuf,
}

#[cfg(target_os = "macos")]
static OPEN_FILE_APP: OnceCell<tauri::AppHandle> = OnceCell::new();

#[cfg(target_os = "macos")]
unsafe extern "C" fn application_open_files(
    _: &Object,
    _: Sel,
    application: id,
    filenames: id,
) {
    let count: usize = msg_send![filenames, count];
    let mut paths = Vec::new();
    for index in 0..count {
        let value: id = msg_send![filenames, objectAtIndex: index];
        let utf8: *const c_char = msg_send![value, UTF8String];
        if !utf8.is_null() {
            paths.push(PathBuf::from(CStr::from_ptr(utf8).to_string_lossy().into_owned()));
        }
    }
    let files = calendar_paths(paths);
    if !files.is_empty() {
        if let Some(app) = OPEN_FILE_APP.get() {
            if let Ok(mut pending) = app.state::<PendingCalendarFiles>().0.lock() {
                pending.extend(files);
            }
            let _ = app.emit_all("calendar-files-ready", ());
            if let Some(window) = app.get_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }
    }
    let _: () = msg_send![application, replyToOpenOrPrint: 0_i64];
}

#[cfg(target_os = "macos")]
fn install_open_file_handler(app: &tauri::AppHandle) {
    let _ = OPEN_FILE_APP.set(app.clone());
    unsafe {
        let application = NSApp();
        let delegate: id = msg_send![application, delegate];
        if delegate.is_null() {
            return;
        }
        let delegate_class: *mut Class = msg_send![delegate, class];
        let implementation: Imp = std::mem::transmute(
            application_open_files as unsafe extern "C" fn(&Object, Sel, id, id),
        );
        class_addMethod(
            delegate_class,
            sel!(application:openFiles:),
            implementation,
            b"v@:@@\0".as_ptr() as *const c_char,
        );
    }
}

#[tauri::command]
fn read_calendar_file(path: String) -> Result<Vec<u8>, String> {
    let calendar_path = PathBuf::from(path);
    let is_ics = calendar_path
        .extension()
        .and_then(|extension| extension.to_str())
        .map(|extension| extension.eq_ignore_ascii_case("ics"))
        .unwrap_or(false);
    if !is_ics {
        return Err("Choose an .ics calendar file.".into());
    }

    let metadata = fs::metadata(&calendar_path).map_err(|error| error.to_string())?;
    if !metadata.is_file() || metadata.len() > MAX_CALENDAR_BYTES {
        return Err("Calendar files must be smaller than 10 MB.".into());
    }
    fs::read(calendar_path).map_err(|error| error.to_string())
}

#[tauri::command]
fn take_pending_calendar_files(state: State<PendingCalendarFiles>) -> Vec<String> {
    let mut pending = state.0.lock().expect("pending calendar lock poisoned");
    std::mem::take(&mut *pending)
}

fn calendar_paths<I>(paths: I) -> Vec<String>
where
    I: IntoIterator,
    I::Item: AsRef<Path>,
{
    paths
        .into_iter()
        .filter_map(|path| {
            let path = path.as_ref();
            let is_ics = path
                .extension()
                .and_then(|extension| extension.to_str())
                .map(|extension| extension.eq_ignore_ascii_case("ics"))
                .unwrap_or(false);
            is_ics.then(|| path.to_string_lossy().to_string())
        })
        .collect()
}

fn native_menu() -> Menu {
    let app_menu = Menu::new()
        .add_native_item(MenuItem::About(
            "Canvenient".into(),
            AboutMetadata::new().version(env!("CARGO_PKG_VERSION")),
        ))
        .add_native_item(MenuItem::Separator)
        .add_item(CustomMenuItem::new("settings", "Settings…").accelerator("CmdOrCtrl+,"))
        .add_native_item(MenuItem::Separator)
        .add_item(CustomMenuItem::new("restart-app", "Restart Canvenient"))
        .add_native_item(MenuItem::Separator)
        .add_native_item(MenuItem::Services)
        .add_native_item(MenuItem::Separator)
        .add_native_item(MenuItem::Hide)
        .add_native_item(MenuItem::HideOthers)
        .add_native_item(MenuItem::ShowAll)
        .add_native_item(MenuItem::Separator)
        .add_native_item(MenuItem::Quit);

    let file_menu = Menu::new()
        .add_item(CustomMenuItem::new("new-task", "New Task"))
        .add_item(CustomMenuItem::new("new-note", "New Note"))
        .add_native_item(MenuItem::Separator)
        .add_item(CustomMenuItem::new("import-timetable", "Import Timetable…").accelerator("CmdOrCtrl+O"))
        .add_native_item(MenuItem::Separator)
        .add_native_item(MenuItem::CloseWindow);

    let edit_menu = Menu::new()
        .add_native_item(MenuItem::Undo)
        .add_native_item(MenuItem::Redo)
        .add_native_item(MenuItem::Separator)
        .add_native_item(MenuItem::Cut)
        .add_native_item(MenuItem::Copy)
        .add_native_item(MenuItem::Paste)
        .add_native_item(MenuItem::SelectAll);

    let view_menu = Menu::new()
        .add_item(CustomMenuItem::new("view-dashboard", "Dashboard").accelerator("CmdOrCtrl+1"))
        .add_item(CustomMenuItem::new("view-tasks", "Tasks").accelerator("CmdOrCtrl+2"))
        .add_item(CustomMenuItem::new("view-schedule", "Schedule").accelerator("CmdOrCtrl+3"))
        .add_item(CustomMenuItem::new("view-venues", "Venue Finder").accelerator("CmdOrCtrl+4"))
        .add_item(CustomMenuItem::new("view-canvas", "Canvas").accelerator("CmdOrCtrl+5"))
        .add_item(CustomMenuItem::new("view-notes", "Notes").accelerator("CmdOrCtrl+6"))
        .add_item(CustomMenuItem::new("view-groups", "Groups").accelerator("CmdOrCtrl+7"))
        .add_item(CustomMenuItem::new("view-wheel", "Spin the Wheel").accelerator("CmdOrCtrl+8"))
        .add_native_item(MenuItem::Separator)
        .add_item(CustomMenuItem::new("search", "Search…"))
        .add_item(CustomMenuItem::new("toggle-sidebar", "Toggle Sidebar"))
        .add_native_item(MenuItem::Separator)
        .add_native_item(MenuItem::EnterFullScreen);

    let window_menu = Menu::new()
        .add_native_item(MenuItem::Minimize)
        .add_native_item(MenuItem::Zoom);

    let help_menu = Menu::new().add_item(
        CustomMenuItem::new("keyboard-shortcuts", "Keyboard Shortcuts").accelerator("CmdOrCtrl+/"),
    );

    Menu::new()
        .add_submenu(Submenu::new("Canvenient", app_menu))
        .add_submenu(Submenu::new("File", file_menu))
        .add_submenu(Submenu::new("Edit", edit_menu))
        .add_submenu(Submenu::new("View", view_menu))
        .add_submenu(Submenu::new("Window", window_menu))
        .add_submenu(Submenu::new("Help", help_menu))
}

fn persist_window_state(state: &SavedWindowState, window: &tauri::Window) {
    let mut value = state.value.lock().expect("window state lock poisoned").clone();
    value.maximized = window.is_maximized().unwrap_or(false);
    if let Some(parent) = state.path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    if let Ok(json) = serde_json::to_vec_pretty(&value) {
        let _ = fs::write(&state.path, json);
    }
}

// Remote-API mode: when <app data dir>/use-remote-api exists and its first
// non-empty line is an HTTP(S) URL, the frontend talks to that hosted server
// instead of the bundled localhost sidecar, and the sidecar is not started.
fn read_remote_api_base(app: &tauri::AppHandle) -> Option<String> {
    let data_dir = app.path_resolver().app_data_dir()?;
    let marker = fs::read_to_string(data_dir.join("use-remote-api")).ok()?;
    let url = marker.lines().map(str::trim).find(|line| !line.is_empty())?;
    if url.starts_with("http://") || url.starts_with("https://") {
        Some(url.trim_end_matches('/').to_string())
    } else {
        None
    }
}

#[tauri::command]
fn remote_api_base_url(app: tauri::AppHandle) -> Option<String> {
    read_remote_api_base(&app)
}

fn main() {
    let startup_calendar_files = calendar_paths(std::env::args_os().skip(1).map(PathBuf::from));

    let app = tauri::Builder::default()
        .menu(native_menu())
        .enable_macos_default_menu(false)
        .manage(BackendProcess(Mutex::new(None)))
        .manage(PendingCalendarFiles(Mutex::new(startup_calendar_files)))
        .invoke_handler(tauri::generate_handler![
            read_calendar_file,
            take_pending_calendar_files,
            remote_api_base_url
        ])
        .setup(|app| {
            #[cfg(target_os = "macos")]
            install_open_file_handler(&app.handle());

            let config_dir = app
                .path_resolver()
                .app_config_dir()
                .ok_or_else(|| "Could not resolve the app config directory".to_string())?;
            let window_state_path = config_dir.join("window-state.json");
            let saved_window_state = fs::read(&window_state_path)
                .ok()
                .and_then(|bytes| serde_json::from_slice::<WindowState>(&bytes).ok())
                .unwrap_or_default();
            if let Some(window) = app.get_window("main") {
                let _ = window.set_size(PhysicalSize::new(saved_window_state.width, saved_window_state.height));
                let _ = window.set_position(PhysicalPosition::new(saved_window_state.x, saved_window_state.y));
                if saved_window_state.maximized {
                    let _ = window.maximize();
                }
            }
            app.manage(SavedWindowState {
                value: Mutex::new(saved_window_state),
                path: window_state_path,
            });

            #[cfg(debug_assertions)]
            let data_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../backend");
            #[cfg(not(debug_assertions))]
            let data_dir = app
                .path_resolver()
                .app_data_dir()
                .ok_or_else(|| "Could not resolve the app data directory".to_string())?;
            fs::create_dir_all(&data_dir)?;

            if read_remote_api_base(&app.handle()).is_some() {
                println!("Remote API mode: use-remote-api marker found; bundled sidecar not started");
            } else {
                match Command::new_sidecar("backend") {
                    Ok(cmd) => {
                        let command = cmd
                            .args(["--data-dir", &data_dir.to_string_lossy()])
                            .current_dir(data_dir.clone());
                        match command.spawn() {
                            Ok((mut receiver, child)) => {
                                app.state::<BackendProcess>()
                                    .0
                                    .lock()
                                    .expect("backend process lock poisoned")
                                    .replace(child);
                                tauri::async_runtime::spawn(async move {
                                    while let Some(event) = receiver.recv().await {
                                        match event {
                                            CommandEvent::Stdout(line) => println!("backend: {}", line),
                                            CommandEvent::Stderr(line) => eprintln!("backend: {}", line),
                                            _ => {}
                                        }
                                    }
                                });
                            }
                            Err(error) => eprintln!("Failed to spawn sidecar: {}", error),
                        }
                    }
                    Err(error) => eprintln!("Failed to create sidecar command: {}", error),
                }
            }

            let app_handle = app.handle();
            let mut shortcut_manager = app.global_shortcut_manager();
            let _ = shortcut_manager.register("CmdOrControl+J", move || {
                if let Some(window) = app_handle.get_window("main") {
                    if let Ok(visible) = window.is_visible() {
                        if visible {
                            let _ = window.hide();
                        } else {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                }
            });

            Ok(())
        })
        .on_menu_event(|event| {
            if event.menu_item_id() == "restart-app" {
                event.window().app_handle().restart();
            }
            let _ = event.window().emit("menu-action", event.menu_item_id().to_string());
        })
        .on_window_event(|event| {
            if event.window().label() != "main" {
                return;
            }
            match event.event() {
                WindowEvent::Moved(position) => {
                    if !event.window().is_maximized().unwrap_or(false) {
                        let state = event.window().state::<SavedWindowState>();
                        let mut value = state.value.lock().expect("window state lock poisoned");
                        value.x = position.x;
                        value.y = position.y;
                    }
                }
                WindowEvent::Resized(size) => {
                    if !event.window().is_maximized().unwrap_or(false) {
                        let state = event.window().state::<SavedWindowState>();
                        let mut value = state.value.lock().expect("window state lock poisoned");
                        value.width = size.width;
                        value.height = size.height;
                    }
                }
                WindowEvent::Focused(false) | WindowEvent::CloseRequested { .. } => {
                    let state = event.window().state::<SavedWindowState>();
                    persist_window_state(&state, event.window());
                }
                WindowEvent::FileDrop(tauri::FileDropEvent::Dropped(paths)) => {
                    let files = calendar_paths(paths);
                    if !files.is_empty() {
                        if let Ok(mut pending) = event.window().state::<PendingCalendarFiles>().0.lock() {
                            pending.extend(files);
                        }
                        let _ = event.window().emit("calendar-files-ready", ());
                    }
                }
                _ => {}
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|app_handle, event| {
        if let tauri::RunEvent::Exit = event {
            if let Ok(mut process) = app_handle.state::<BackendProcess>().0.lock() {
                if let Some(child) = process.take() {
                    let pid = child.pid().to_string();
                    #[cfg(unix)]
                    let _ = SystemCommand::new("/usr/bin/pkill")
                        .args(["-TERM", "-P", &pid])
                        .status();
                    #[cfg(windows)]
                    let _ = SystemCommand::new("taskkill")
                        .args(["/PID", &pid, "/T", "/F"])
                        .status();
                    let _ = child.kill();
                }
            }
        }
    });
}
