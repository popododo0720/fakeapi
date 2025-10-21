import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-opener";
import "./Sidebar.css";

interface ServerStatus {
  running: boolean;
  port?: number;
  is_tls?: boolean;
}

interface TlsConfig {
  cert_path: string;
  key_path: string;
}

export function Sidebar() {
  const [port, setPort] = useState<number>(3000);
  const [serverStatus, setServerStatus] = useState<ServerStatus>({ running: false });
  const [enableTls, setEnableTls] = useState<boolean>(false);
  const [showTlsConfig, setShowTlsConfig] = useState<boolean>(false);
  const [certPath, setCertPath] = useState<string>("");
  const [keyPath, setKeyPath] = useState<string>("");
  const [tlsConfigured, setTlsConfigured] = useState<boolean>(false);

  useEffect(() => {
    checkServerStatus();
    loadTlsConfig();
  }, []);

  async function checkServerStatus() {
    try {
      const status = await invoke<ServerStatus>("get_server_status");
      setServerStatus(status);
      if (status.port) {
        setPort(status.port);
      }
    } catch (error) {
      console.error("Failed to get server status:", error);
    }
  }

  async function loadTlsConfig() {
    try {
      const config = await invoke<TlsConfig | null>("get_tls_config");
      if (config) {
        setCertPath(config.cert_path);
        setKeyPath(config.key_path);
        setTlsConfigured(true);
      }
    } catch (error) {
      console.error("Failed to load TLS config:", error);
    }
  }

  async function handleSaveTlsConfig() {
    try {
      await invoke("set_tls_config", { certPath, keyPath });
      setTlsConfigured(true);
      setShowTlsConfig(false);
      alert("TLS configuration saved successfully!");
    } catch (error) {
      console.error("Failed to save TLS config:", error);
      alert(`Failed to save TLS config: ${error}`);
    }
  }

  async function handleClearTlsConfig() {
    try {
      await invoke("clear_tls_config");
      setCertPath("");
      setKeyPath("");
      setTlsConfigured(false);
      setEnableTls(false);
      alert("TLS configuration cleared");
    } catch (error) {
      console.error("Failed to clear TLS config:", error);
    }
  }

  async function handleStartServer() {
    try {
      const message = await invoke<string>("start_server", { port, enableTls });
      await checkServerStatus();
      alert(message);
    } catch (error) {
      console.error("Failed to start server:", error);
      alert(`Failed to start server: ${error}`);
    }
  }

  async function handleStopServer() {
    try {
      await invoke("stop_server");
      await checkServerStatus();
    } catch (error) {
      console.error("Failed to stop server:", error);
      alert(`Failed to stop server: ${error}`);
    }
  }

  const protocol = serverStatus.is_tls ? "https" : "http";

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <h2>Mock API Server</h2>
      </div>

      <div className="sidebar-section">
        <h3>Server Settings</h3>

        <div className="status-indicator">
          <div className={`status-dot ${serverStatus.running ? 'running' : 'stopped'}`}></div>
          <span>{serverStatus.running ? 'Running' : 'Stopped'}</span>
        </div>

        {serverStatus.running && (
          <div className="server-info">
            <p>Port: <strong>{serverStatus.port}</strong></p>
            <p className="url">{protocol}://localhost:{serverStatus.port}</p>
            {serverStatus.is_tls && <p className="tls-badge">🔒 TLS Enabled</p>}
          </div>
        )}

        <div className="port-input">
          <label>Port:</label>
          <input
            type="number"
            value={port}
            onChange={(e) => setPort(Number(e.target.value))}
            disabled={serverStatus.running}
            min={1024}
            max={65535}
          />
        </div>

        <div className="tls-toggle">
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={enableTls}
              onChange={(e) => setEnableTls(e.target.checked)}
              disabled={serverStatus.running}
            />
            <span>Enable TLS/HTTPS</span>
          </label>
        </div>

        {enableTls && (
          <div className="tls-config-section">
            {tlsConfigured ? (
              <div className="tls-configured">
                <p className="config-status">✓ TLS certificates configured</p>
                <button
                  className="btn-secondary"
                  onClick={() => setShowTlsConfig(true)}
                  disabled={serverStatus.running}
                >
                  Edit Config
                </button>
                <button
                  className="btn-secondary btn-danger-outline"
                  onClick={handleClearTlsConfig}
                  disabled={serverStatus.running}
                >
                  Clear
                </button>
              </div>
            ) : (
              <button
                className="btn-secondary"
                onClick={() => setShowTlsConfig(true)}
              >
                Configure TLS
              </button>
            )}
          </div>
        )}

        {showTlsConfig && (
          <div className="tls-config-modal">
            <h4>TLS Configuration</h4>
            <div className="form-group">
              <label>Certificate File (.pem/.crt):</label>
              <input
                type="text"
                placeholder="C:\certs\cert.pem"
                value={certPath}
                onChange={(e) => setCertPath(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label>Private Key File (.key):</label>
              <input
                type="text"
                placeholder="C:\certs\key.pem"
                value={keyPath}
                onChange={(e) => setKeyPath(e.target.value)}
              />
            </div>
            <div className="modal-buttons">
              <button className="btn-primary" onClick={handleSaveTlsConfig}>
                Save
              </button>
              <button
                className="btn-secondary"
                onClick={() => setShowTlsConfig(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        <div className="server-controls">
          {!serverStatus.running ? (
            <button
              className="btn-start"
              onClick={handleStartServer}
              disabled={enableTls && !tlsConfigured}
            >
              Start Server
            </button>
          ) : (
            <button className="btn-stop" onClick={handleStopServer}>
              Stop Server
            </button>
          )}
        </div>
      </div>

      <div className="sidebar-section">
        <h3>Navigation</h3>
        <nav className="sidebar-nav">
          <a href="#endpoints" className="active">Endpoints</a>
          <a href="#settings">Settings</a>
        </nav>
      </div>
    </div>
  );
}
