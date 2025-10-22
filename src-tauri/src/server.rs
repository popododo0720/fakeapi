use axum::{
    Router,
    http::{Method, StatusCode},
    body::Body,
    response::Response,
    extract::State,
};
use std::sync::Arc;
use tokio::sync::RwLock;
use tower_http::cors::CorsLayer;

use crate::endpoints::Endpoint;

pub struct ServerHandle {
    pub shutdown_tx: Option<tokio::sync::oneshot::Sender<()>>,
    pub port: u16,
    pub is_tls: bool,
}

impl ServerHandle {
    pub fn new(port: u16, is_tls: bool) -> Self {
        Self {
            shutdown_tx: None,
            port,
            is_tls,
        }
    }
}

#[derive(Clone)]
pub struct ServerState {
    pub app_state: Arc<RwLock<Vec<Endpoint>>>,
}

pub async fn start_server(
    port: u16,
    bind_addr: String,
    app_state: Arc<RwLock<Vec<Endpoint>>>,
) -> Result<tokio::sync::oneshot::Sender<()>, String> {
    let server_state = ServerState {
        app_state: app_state.clone(),
    };

    let app = Router::new()
        .fallback(dynamic_handler)
        .layer(CorsLayer::permissive())
        .with_state(server_state);

    let addr = format!("{}:{}", bind_addr, port);
    let listener = tokio::net::TcpListener::bind(&addr)
        .await
        .map_err(|e| format!("Failed to bind to {}: {}", addr, e))?;

    let (shutdown_tx, shutdown_rx) = tokio::sync::oneshot::channel();

    tokio::spawn(async move {
        axum::serve(listener, app)
            .with_graceful_shutdown(async {
                shutdown_rx.await.ok();
            })
            .await
            .expect("Server error");
    });

    Ok(shutdown_tx)
}

pub async fn start_tls_server(
    port: u16,
    bind_addr: String,
    app_state: Arc<RwLock<Vec<Endpoint>>>,
    cert_path: String,
    key_path: String,
) -> Result<tokio::sync::oneshot::Sender<()>, String> {
    let server_state = ServerState {
        app_state: app_state.clone(),
    };

    let app = Router::new()
        .fallback(dynamic_handler)
        .layer(CorsLayer::permissive())
        .with_state(server_state);

    let addr = format!("{}:{}", bind_addr, port);

    // Load TLS certificates using axum-server's RustlsConfig
    let config = axum_server::tls_rustls::RustlsConfig::from_pem_file(&cert_path, &key_path)
        .await
        .map_err(|e| format!("Failed to load TLS config: {}", e))?;

    let (shutdown_tx, shutdown_rx) = tokio::sync::oneshot::channel();

    tokio::spawn(async move {
        let server = axum_server::bind_rustls(addr.parse().unwrap(), config)
            .serve(app.into_make_service());

        tokio::select! {
            result = server => {
                if let Err(e) = result {
                    eprintln!("Server error: {}", e);
                }
            }
            _ = shutdown_rx => {
                // Graceful shutdown
            }
        }
    });

    Ok(shutdown_tx)
}

async fn dynamic_handler(
    State(state): State<ServerState>,
    req: axum::extract::Request,
) -> Response<Body> {
    let method = req.method().clone();
    let path = req.uri().path().to_string();

    let endpoints = state.app_state.read().await;

    for endpoint in endpoints.iter() {
        if endpoint.path == path && method_matches(&method, &endpoint.method) {
            return Response::builder()
                .status(StatusCode::OK)
                .header("Content-Type", "application/json")
                .body(Body::from(endpoint.response.clone()))
                .unwrap();
        }
    }

    Response::builder()
        .status(StatusCode::NOT_FOUND)
        .body(Body::from(r#"{"error": "Endpoint not found"}"#))
        .unwrap()
}

fn method_matches(req_method: &Method, endpoint_method: &str) -> bool {
    match endpoint_method.to_uppercase().as_str() {
        "GET" => req_method == Method::GET,
        "POST" => req_method == Method::POST,
        "PUT" => req_method == Method::PUT,
        "DELETE" => req_method == Method::DELETE,
        "PATCH" => req_method == Method::PATCH,
        _ => false,
    }
}
