import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
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

interface NetworkInterface {
  name: string;
  ip: string;
}

export function Sidebar() {
  const [port, setPort] = useState<number>(3000);
  const [serverStatus, setServerStatus] = useState<ServerStatus>({ running: false });
  const [enableTls, setEnableTls] = useState<boolean>(false);
  const [showTlsConfig, setShowTlsConfig] = useState<boolean>(false);
  const [certPath, setCertPath] = useState<string>("");
  const [keyPath, setKeyPath] = useState<string>("");
  const [tlsConfigured, setTlsConfigured] = useState<boolean>(false);
  const [networkInterfaces, setNetworkInterfaces] = useState<NetworkInterface[]>([]);
  const [selectedInterface, setSelectedInterface] = useState<string>("127.0.0.1");

  useEffect(() => {
    checkServerStatus();
    loadTlsConfig();
    loadNetworkInterfaces();
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

  async function loadNetworkInterfaces() {
    try {
      const interfaces = await invoke<NetworkInterface[]>("get_network_interfaces");
      setNetworkInterfaces(interfaces);
    } catch (error) {
      console.error("Failed to load network interfaces:", error);
    }
  }

  async function handleBrowseCertFile() {
    try {
      const selected = await openDialog({
        title: "Select Certificate File",
        filters: [{
          name: "Certificate Files",
          extensions: ["pem", "crt", "cer"]
        }]
      });
      if (selected) {
        setCertPath(selected);
      }
    } catch (error) {
      console.error("Failed to open file dialog:", error);
    }
  }

  async function handleBrowseKeyFile() {
    try {
      const selected = await openDialog({
        title: "Select Private Key File",
        filters: [{
          name: "Key Files",
          extensions: ["key", "pem"]
        }]
      });
      if (selected) {
        setKeyPath(selected);
      }
    } catch (error) {
      console.error("Failed to open file dialog:", error);
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
      await invoke("cleanup_temp_certificates");
      setCertPath("");
      setKeyPath("");
      setTlsConfigured(false);
      setEnableTls(false);
      alert("TLS configuration cleared");
    } catch (error) {
      console.error("Failed to clear TLS config:", error);
    }
  }

  async function handleGenerateTempCert() {
    try {
      const config = await invoke<TlsConfig>("generate_temp_certificate");
      setCertPath(config.cert_path);
      setKeyPath(config.key_path);
      setTlsConfigured(true);
      setShowTlsConfig(false);
      alert("Temporary certificate generated successfully!");
    } catch (error) {
      console.error("Failed to generate temp certificate:", error);
      alert(`Failed to generate certificate: ${error}`);
    }
  }

  async function handleStartServer() {
    try {
      const message = await invoke<string>("start_server", {
        port,
        bindAddr: selectedInterface,
        enableTls
      });
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
        <h2>AKA</h2>
      </div>

      <div className="sidebar-section">
        <h3>Server Settings</h3>

        <div className="status-indicator">
          <div className={`status-dot ${serverStatus.running ? 'running' : 'stopped'}`}></div>
          <span>{serverStatus.running ? 'Running' : 'Stopped'}</span>
        </div>

        {serverStatus.running && (
          <div className="server-info">
            <p className="url">
              {protocol}://{selectedInterface}:{serverStatus.port}
            </p>
          </div>
        )}

        <div className="port-input">
          <label>Bind Address:</label>
          <select
            value={selectedInterface}
            onChange={(e) => setSelectedInterface(e.target.value)}
            disabled={serverStatus.running}
          >
            {networkInterfaces.map((iface) => (
              <option key={iface.ip} value={iface.ip}>
                {iface.name}
              </option>
            ))}
          </select>
        </div>

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
              onChange={(e) => {
                const checked = e.target.checked;
                setEnableTls(checked);
                if (!checked) {
                  setShowTlsConfig(false);
                }
              }}
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
                  onClick={() => setShowTlsConfig(!showTlsConfig)}
                  disabled={serverStatus.running}
                >
                  {showTlsConfig ? "Hide Config" : "Edit Config"}
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
              <div className="tls-buttons">
                <button
                  className="btn-secondary"
                  onClick={() => setShowTlsConfig(!showTlsConfig)}
                >
                  {showTlsConfig ? "Hide Config" : "Configure TLS"}
                </button>
                <button
                  className="btn-secondary btn-temp-cert"
                  onClick={handleGenerateTempCert}
                >
                  Use Temp Certificate
                </button>
              </div>
            )}
          </div>
        )}

        {showTlsConfig && (
          <div className="tls-config-modal">
            <h4>TLS Configuration</h4>
            <div className="form-group">
              <label>Certificate File (.pem/.crt):</label>
              <div className="file-input-group">
                <input
                  type="text"
                  placeholder="C:\certs\cert.pem"
                  value={certPath}
                  onChange={(e) => setCertPath(e.target.value)}
                />
                <button
                  className="btn-browse"
                  onClick={handleBrowseCertFile}
                  type="button"
                >
                  Browse...
                </button>
              </div>
            </div>
            <div className="form-group">
              <label>Private Key File (.key):</label>
              <div className="file-input-group">
                <input
                  type="text"
                  placeholder="C:\certs\key.pem"
                  value={keyPath}
                  onChange={(e) => setKeyPath(e.target.value)}
                />
                <button
                  className="btn-browse"
                  onClick={handleBrowseKeyFile}
                  type="button"
                >
                  Browse...
                </button>
              </div>
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
