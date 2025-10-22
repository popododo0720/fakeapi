use std::sync::Arc;
use serde::{Deserialize, Serialize};
use tokio::sync::RwLock;
use std::fs;
use tauri_plugin_dialog::DialogExt;
use rcgen::generate_simple_self_signed;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Endpoint {
    pub id: String,
    pub method: String,
    pub path: String,
    pub status: u16,
    pub delay: u64,
    pub response: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TlsConfig {
    pub cert_path: String,
    pub key_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerSettings {
    pub port: u16,
    pub bind_addr: String,
    pub enable_tls: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectData {
    pub name: String,
    #[serde(rename = "lastSaved")]
    pub last_saved: String,
    pub endpoints: Vec<Endpoint>,
    pub settings: ServerSettings,
    #[serde(rename = "tlsConfig")]
    pub tls_config: Option<TlsConfig>,
}

pub struct AppState {
    pub endpoints: Arc<RwLock<Vec<Endpoint>>>,
    pub server_handle: Arc<RwLock<Option<crate::server::ServerHandle>>>,
    pub tls_config: Arc<RwLock<Option<TlsConfig>>>,
    pub temp_cert_paths: Arc<RwLock<Option<(String, String)>>>,
    pub server_settings: Arc<RwLock<ServerSettings>>, // Add this line
}

impl AppState {
    pub fn new() -> Self {
        Self {
            endpoints: Arc::new(RwLock::new(Vec::new())),
            server_handle: Arc::new(RwLock::new(None)),
            tls_config: Arc::new(RwLock::new(None)),
            temp_cert_paths: Arc::new(RwLock::new(None)),
            server_settings: Arc::new(RwLock::new(ServerSettings { // Initialize with default settings
                port: 3000,
                bind_addr: "127.0.0.1".to_string(),
                enable_tls: false,
            })),
        }
    }
}

#[tauri::command]
pub async fn add_endpoint(
    state: tauri::State<'_, AppState>,
    method: String,
    path: String,
    response: String,
    status: u16,
    delay: u64,
) -> Result<Endpoint, String> {
    let endpoint = Endpoint {
        id: uuid::Uuid::new_v4().to_string(),
        method,
        path,
        status,
        delay,
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

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartServerParams {
    port: u16,
    bind_addr: String,
    enable_tls: bool,
}

#[tauri::command]
pub async fn start_server(
    state: tauri::State<'_, AppState>,
    params: StartServerParams,
) -> Result<String, String> {
    let mut handle = state.server_handle.write().await;

    // 이미 실행 중이면 먼저 종료
    if let Some(mut existing_handle) = handle.take() {
        if let Some(tx) = existing_handle.shutdown_tx.take() {
            let _ = tx.send(());
            // 잠깐 대기
            drop(handle);
            tokio::time::sleep(tokio::time::Duration::from_millis(300)).await;
            handle = state.server_handle.write().await;
        }
    }

    let shutdown_tx = if params.enable_tls {
        // Start TLS server
        let tls_config = state.tls_config.read().await;
        let tls = tls_config.as_ref()
            .ok_or_else(|| "TLS is enabled but no certificate configured".to_string())?;

        crate::server::start_tls_server(
            params.port,
            params.bind_addr.clone(),
            state.endpoints.clone(),
            tls.cert_path.clone(),
            tls.key_path.clone(),
        )
        .await
        .map_err(|e| format!("Failed to start TLS server: {}", e))?
    } else {
        // Start regular HTTP server
        crate::server::start_server(params.port, params.bind_addr.clone(), state.endpoints.clone())
            .await
            .map_err(|e| format!("Failed to start server: {}", e))?
    };

    let mut server_handle = crate::server::ServerHandle::new(params.port, params.enable_tls);
    server_handle.shutdown_tx = Some(shutdown_tx);
    *handle = Some(server_handle);

    let protocol = if params.enable_tls { "https" } else { "http" };
    let display_addr = &params.bind_addr;
    Ok(format!("Server started on {}://{}:{}", protocol, display_addr, params.port))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetTlsConfigParams {
    cert_path: String,
    key_path: String,
}

#[tauri::command]
pub async fn set_tls_config(
    state: tauri::State<'_, AppState>,
    params: SetTlsConfigParams,
) -> Result<String, String> {
    let mut tls_config = state.tls_config.write().await;
    *tls_config = Some(TlsConfig {
        cert_path: params.cert_path,
        key_path: params.key_path,
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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NetworkInterface {
    pub name: String,
    pub ip: String,
}

#[tauri::command]
pub async fn get_network_interfaces() -> Result<Vec<NetworkInterface>, String> {
    let mut interfaces = vec![
        NetworkInterface {
            name: "Localhost (127.0.0.1)".to_string(),
            ip: "127.0.0.1".to_string(),
        },
        NetworkInterface {
            name: "All Interfaces (0.0.0.0)".to_string(),
            ip: "0.0.0.0".to_string(),
        },
    ];

    // Get network interfaces
    match local_ip_address::list_afinet_netifas() {
        Ok(netifs) => {
            for (name, ip) in netifs {
                // Skip localhost and link-local addresses
                let ip_str = ip.to_string();
                if ip_str != "127.0.0.1" && !ip_str.starts_with("169.254") {
                    interfaces.push(NetworkInterface {
                        name: format!("{} ({})", name, ip_str),
                        ip: ip_str,
                    });
                }
            }
        }
        Err(e) => {
            eprintln!("Failed to get network interfaces: {}", e);
        }
    }

    Ok(interfaces)
}

#[tauri::command]
pub async fn generate_temp_certificate(
    state: tauri::State<'_, AppState>
) -> Result<TlsConfig, String> {
    // localhost용 self-signed certificate 생성
    let cert = generate_simple_self_signed(vec!["localhost".into()])
        .map_err(|e| format!("Failed to generate certificate: {}", e))?;

    // PEM 직렬화
    let cert_pem = cert.cert.pem();
    let key_pem = cert.signing_key.serialize_pem();

    // 임시 디렉토리 생성
    let temp_dir = std::env::temp_dir().join("aka_mock_server");
    std::fs::create_dir_all(&temp_dir)
        .map_err(|e| format!("Failed to create temp directory: {}", e))?;

    let cert_path = temp_dir.join("temp_cert.pem");
    let key_path = temp_dir.join("temp_key.pem");

    std::fs::write(&cert_path, cert_pem)
        .map_err(|e| format!("Failed to write certificate: {}", e))?;
    std::fs::write(&key_path, key_pem)
        .map_err(|e| format!("Failed to write key: {}", e))?;

    let cert_path_str = cert_path.to_string_lossy().to_string();
    let key_path_str = key_path.to_string_lossy().to_string();

    *state.temp_cert_paths.write().await = Some((cert_path_str.clone(), key_path_str.clone()));

    let config = TlsConfig {
        cert_path: cert_path_str,
        key_path: key_path_str,
    };
    *state.tls_config.write().await = Some(config.clone());

    Ok(config)
}

#[tauri::command]
pub async fn cleanup_temp_certificates(state: tauri::State<'_, AppState>) -> Result<(), String> {
    let temp_paths = state.temp_cert_paths.write().await.take();

    if let Some((cert_path, key_path)) = temp_paths {
        let _ = std::fs::remove_file(&cert_path);
        let _ = std::fs::remove_file(&key_path);
    }

    Ok(())
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveProjectParams {
    data: String,
    filename: String,
}

#[tauri::command]
pub async fn save_project(app: tauri::AppHandle, params: SaveProjectParams) -> Result<(), String> {
    let (tx, rx) = tokio::sync::oneshot::channel();
    app.dialog()
        .file()
        .add_filter("JSON", &["json"])
        .set_file_name(&params.filename)
        .save_file(move |file_path| {
            let result = match file_path {
                Some(path) => {
                    match path.into_path() {
                        Ok(path_buf) => fs::write(path_buf, &params.data).map_err(|e| e.to_string()),
                        Err(e) => Err(format!("Invalid file path: {}", e)),
                    }
                },
                None => Ok(()),
            };
            let _ = tx.send(result);
        });
    rx.await.unwrap_or(Ok(()))
}

#[tauri::command]
pub async fn load_project(app: tauri::AppHandle) -> Result<String, String> {
    let (tx, rx) = tokio::sync::oneshot::channel();
    app.dialog()
    .file()
    .add_filter("JSON", &["json"])
    .pick_file(move |file_path| {
        let result = match file_path {
            Some(path) => {
                match path.into_path() {
                    Ok(path_buf) => fs::read_to_string(path_buf).map_err(|e| e.to_string()),
                    Err(e) => Err(format!("Invalid file path: {}", e)),
                }
            },
            None => Ok(String::new()),
        };
        let _ = tx.send(result);
    });
    rx.await.unwrap_or(Ok(String::new()))
}

#[tauri::command]
pub async fn set_project_state(state: tauri::State<'_, AppState>, project_data: ProjectData) -> Result<(), String> {
    *state.endpoints.write().await = project_data.endpoints;
    *state.tls_config.write().await = project_data.tls_config;
    *state.server_settings.write().await = project_data.settings;
    Ok(())
}
