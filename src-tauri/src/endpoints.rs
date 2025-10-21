use std::sync::Arc;
use serde::{Deserialize, Serialize};
use tokio::sync::RwLock;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Endpoint {
    pub id: String,
    pub method: String,
    pub path: String,
    pub response: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TlsConfig {
    pub cert_path: String,
    pub key_path: String,
}

pub struct AppState {
    pub endpoints: Arc<RwLock<Vec<Endpoint>>>,
    pub server_handle: Arc<RwLock<Option<crate::server::ServerHandle>>>,
    pub tls_config: Arc<RwLock<Option<TlsConfig>>>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            endpoints: Arc::new(RwLock::new(Vec::new())),
            server_handle: Arc::new(RwLock::new(None)),
            tls_config: Arc::new(RwLock::new(None)),
        }
    }
}

#[tauri::command]
pub async fn add_endpoint(
    state: tauri::State<'_, AppState>,
    method: String,
    path: String,
    response: String,
) -> Result<Endpoint, String> {
    let endpoint = Endpoint {
        id: uuid::Uuid::new_v4().to_string(),
        method,
        path,
        response,
    };

    state.endpoints.write().await.push(endpoint.clone());
    Ok(endpoint)
}

#[tauri::command]
pub async fn get_endpoints(state: tauri::State<'_, AppState>) -> Result<Vec<Endpoint>, String> {
    Ok(state.endpoints.read().await.clone())
}

#[tauri::command]
pub async fn delete_endpoint(state: tauri::State<'_, AppState>, id: String) -> Result<(), String> {
    let mut endpoints = state.endpoints.write().await;
    endpoints.retain(|e| e.id != id);
    Ok(())
}

#[tauri::command]
pub async fn start_server(state: tauri::State<'_, AppState>, port: u16, enable_tls: bool) -> Result<String, String> {
    let mut handle = state.server_handle.write().await;

    if handle.is_some() {
        return Err("Server is already running".to_string());
    }

    let shutdown_tx = if enable_tls {
        // Start TLS server
        let tls_config = state.tls_config.read().await;
        let tls = tls_config.as_ref()
            .ok_or_else(|| "TLS is enabled but no certificate configured".to_string())?;

        crate::server::start_tls_server(
            port,
            state.endpoints.clone(),
            tls.cert_path.clone(),
            tls.key_path.clone(),
        )
        .await
        .map_err(|e| format!("Failed to start TLS server: {}", e))?
    } else {
        // Start regular HTTP server
        crate::server::start_server(port, state.endpoints.clone())
            .await
            .map_err(|e| format!("Failed to start server: {}", e))?
    };

    *handle = Some(crate::server::ServerHandle {
        shutdown_tx: Some(shutdown_tx),
        port,
        is_tls: enable_tls,
    });

    let protocol = if enable_tls { "https" } else { "http" };
    Ok(format!("Server started on {}://localhost:{}", protocol, port))
}

#[tauri::command]
pub async fn set_tls_config(
    state: tauri::State<'_, AppState>,
    cert_path: String,
    key_path: String,
) -> Result<String, String> {
    let mut tls_config = state.tls_config.write().await;
    *tls_config = Some(TlsConfig {
        cert_path,
        key_path,
    });
    Ok("TLS configuration saved".to_string())
}

#[tauri::command]
pub async fn get_tls_config(state: tauri::State<'_, AppState>) -> Result<Option<TlsConfig>, String> {
    Ok(state.tls_config.read().await.clone())
}

#[tauri::command]
pub async fn clear_tls_config(state: tauri::State<'_, AppState>) -> Result<String, String> {
    let mut tls_config = state.tls_config.write().await;
    *tls_config = None;
    Ok("TLS configuration cleared".to_string())
}

#[tauri::command]
pub async fn stop_server(state: tauri::State<'_, AppState>) -> Result<String, String> {
    let mut handle = state.server_handle.write().await;

    if let Some(mut server_handle) = handle.take() {
        if let Some(tx) = server_handle.shutdown_tx.take() {
            let _ = tx.send(());
            Ok("Server stopped".to_string())
        } else {
            Err("Server shutdown channel not available".to_string())
        }
    } else {
        Err("Server is not running".to_string())
    }
}

#[tauri::command]
pub async fn get_server_status(state: tauri::State<'_, AppState>) -> Result<serde_json::Value, String> {
    let handle = state.server_handle.read().await;

    if let Some(server_handle) = handle.as_ref() {
        Ok(serde_json::json!({
            "running": true,
            "port": server_handle.port,
            "is_tls": server_handle.is_tls
        }))
    } else {
        Ok(serde_json::json!({
            "running": false
        }))
    }
}
