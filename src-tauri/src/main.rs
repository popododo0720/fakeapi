// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod endpoints;
mod server;
use tauri::Manager;

use endpoints::{
    AppState,
    add_endpoint,
    get_endpoints,
    delete_endpoint,
    start_server,
    stop_server,
    get_server_status,
    set_tls_config,
    get_tls_config,
    clear_tls_config,
    get_network_interfaces,
    generate_temp_certificate,
    cleanup_temp_certificates,
    save_project,
    load_project,
    set_project_state
};

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState::new())
        .invoke_handler(tauri::generate_handler![
            add_endpoint,
            get_endpoints,
            delete_endpoint,
            start_server,
            stop_server,
            get_server_status,
            set_tls_config,
            get_tls_config,
            clear_tls_config,
            get_network_interfaces,
            generate_temp_certificate,
            cleanup_temp_certificates,
            save_project,
            load_project,
            set_project_state
        ])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                let app_handle = window.app_handle();
                let state = app_handle.state::<AppState>();
                tauri::async_runtime::block_on(async {
                    let _ = cleanup_temp_certificates(state).await;
                });
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}