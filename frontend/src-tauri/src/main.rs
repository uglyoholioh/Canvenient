#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

use tauri::{Manager, GlobalShortcutManager};
use tauri::api::process::Command;

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            // Spawn the python sidecar
            match Command::new_sidecar("backend") {
                Ok(cmd) => {
                    if let Err(e) = cmd.spawn() {
                        eprintln!("Failed to spawn sidecar: {}", e);
                    } else {
                        println!("Sidecar spawned successfully.");
                    }
                }
                Err(e) => eprintln!("Failed to create sidecar command: {}", e),
            }

            // Global shortcut Cmd+J to toggle window
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
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
