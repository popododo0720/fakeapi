// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod endpoints;
mod server;

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
    clear_tls_config
};

fn main() {
    tauri::Builder::default()
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
            clear_tls_config
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}