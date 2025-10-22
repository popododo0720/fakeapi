import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import "./Sidebar.css";

interface ServerStatus {
  running: boolean;
  port?: number;
  is_tls?: boolean;
}

export interface ServerSettings {
  port: number;
  bindAddr: string;
  enableTls: boolean;
}

export interface TlsConfig {
  certPath: string;
  keyPath: string;
}

interface TlsConfigRust {
  cert_path: string;
  key_path: string;
}

interface NetworkInterface {
  name: string;
  ip: string;
}

interface SidebarProps {
  settings: ServerSettings;
  onSettingsChange: (settings: ServerSettings) => void;
  tlsConfig: TlsConfig | null;
  onTlsConfigChange: (config: TlsConfig | null) => void;
  isServerRunning: boolean;
  onServerStateChange: (isRunning: boolean) => void;
  onServerStart: () => Promise<void>;
}

export function Sidebar({ settings, onSettingsChange, tlsConfig, onTlsConfigChange, isServerRunning, onServerStateChange, onServerStart }: SidebarProps) {
  const [showTlsConfig, setShowTlsConfig] = useState<boolean>(false);
  const [networkInterfaces, setNetworkInterfaces] = useState<NetworkInterface[]>([]);

  useEffect(() => {
    loadNetworkInterfaces();
  }, []);

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
        onTlsConfigChange({
          ...tlsConfig,
          certPath: selected,
        } as TlsConfig);
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
        onTlsConfigChange({
          ...tlsConfig,
          keyPath: selected,
        } as TlsConfig);
      }
    } catch (error) {
      console.error("Failed to open file dialog:", error);
    }
  }

  async function handleSaveTlsConfig() {
    try {
      if (!tlsConfig) return;
      await invoke("set_tls_config", { certPath: tlsConfig.certPath, keyPath: tlsConfig.keyPath });
      // onTlsConfigChange is already handling the state
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
      onTlsConfigChange(null);
      onSettingsChange({ ...settings, enableTls: false });
      console.log("TLS configuration cleared");
    } catch (error) {
      console.error("Failed to clear TLS config:", error);
    }
  }

  async function handleGenerateTempCert() {
    try {
      const config = await invoke<TlsConfigRust>("generate_temp_certificate");
      const tlsConfig = { certPath: config.cert_path, keyPath: config.key_path };
      onTlsConfigChange(tlsConfig);
      // 백엔드에도 TLS 구성 정보 저장
      await invoke("set_tls_config", { 
        params: { 
          certPath: tlsConfig.certPath, 
          keyPath: tlsConfig.keyPath 
        } 
      });
      setShowTlsConfig(false);
      console.log("Temporary certificate generated successfully!");
    } catch (error) {
      console.error("Failed to generate temp certificate:", error);
      alert(`Failed to generate certificate: ${error}`);
    }
  }

  async function handleStartServer() {
    try {
      // 먼저 onServerStart 호출로 기존 정보를 전송
      await onServerStart();
      
      // TLS 설정이 활성화되었고, 현재 tlsConfig가 있다면 이를 백엔드에 다시 동기화
      // 이는 handleGenerateTempCert에서 등록한 TLS 정보가 서버 시작 전에 백엔드에 반영되도록 함
      if (settings.enableTls && tlsConfig) {
        await invoke("set_tls_config", { 
          params: { 
            certPath: tlsConfig.certPath, 
            keyPath: tlsConfig.keyPath 
          } 
        });
      }

      // 먼저 실행 중인 서버가 있으면 종료
      const status = await invoke<ServerStatus>("get_server_status");
      if (status.running) {
        await invoke("stop_server");
        // 서버가 완전히 종료될 때까지 대기
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      // 새 서버 시작
      await invoke<string>("start_server", {
        params: {
          port: settings.port,
          bindAddr: settings.bindAddr,
          enableTls: settings.enableTls
        }
      });
      onServerStateChange(true);
    } catch (error) {
      console.error("Failed to start server:", error);
      alert(`Failed to start server: ${error}`);
      onServerStateChange(false);
    }
  }

  async function handleStopServer() {
    try {
      await invoke("stop_server");
      onServerStateChange(false);
    } catch (error) {
      console.error("Failed to stop server:", error);
      alert(`Failed to stop server: ${error}`);
    }
  }

  const protocol = settings.enableTls ? "https" : "http";

  return (
    <div className="sidebar">
      <div className="sidebar-section">
        <h3>Server Settings</h3>

        <div className="status-indicator">
          <div className={`status-dot ${isServerRunning ? 'running' : 'stopped'}`}></div>
          <span>{isServerRunning ? 'Running' : 'Stopped'}</span>
        </div>

        {isServerRunning && (
          <div className="server-info">
            <p>Server is running at:</p>
            <p className="url">
              {protocol}://{settings.bindAddr}:{settings.port}
            </p>
          </div>
        )}

        <div className="port-input">
          <label>Bind Address</label>
          <select
            value={settings.bindAddr}
            onChange={(e) => onSettingsChange({ ...settings, bindAddr: e.target.value })}
            disabled={isServerRunning}
          >
            {networkInterfaces.map((iface) => (
              <option key={iface.ip} value={iface.ip}>
                {iface.name} ({iface.ip})
              </option>
            ))}
          </select>
        </div>

        <div className="port-input">
          <label>Port</label>
          <input
            type="number"
            value={settings.port}
            onChange={(e) => onSettingsChange({ ...settings, port: Number(e.target.value) })}
            disabled={isServerRunning}
            min={1}
            max={65535}
          />
        </div>

        <div className="tls-toggle">
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={settings.enableTls}
              onChange={(e) => {
                const checked = e.target.checked;
                onSettingsChange({ ...settings, enableTls: checked });
                if (!checked) {
                  setShowTlsConfig(false);
                }
              }}
              disabled={isServerRunning}
            />
            <span>Enable TLS/HTTPS</span>
          </label>
        </div>

        {settings.enableTls && (
          <div className="tls-config-section">
            {tlsConfig ? (
              <div className="tls-configured">
                <p className="config-status">✓ TLS certificates configured</p>
                <button
                  className="btn-secondary"
                  onClick={() => setShowTlsConfig(!showTlsConfig)}
                  disabled={isServerRunning}
                >
                  {showTlsConfig ? "Hide Config" : "Edit Config"}
                </button>
                <button
                  className="btn-secondary btn-danger-outline"
                  onClick={handleClearTlsConfig}
                  disabled={isServerRunning}
                >
                  Clear
                </button>
              </div>
            ) : (
              <div className="tls-buttons">
                <button
                  className="btn-secondary"
                  onClick={() => setShowTlsConfig(!showTlsConfig)}
                  disabled={isServerRunning}
                >
                  {showTlsConfig ? "Hide Config" : "Configure TLS"}
                </button>
                <button
                  className="btn-secondary btn-temp-cert"
                  onClick={handleGenerateTempCert}
                  disabled={isServerRunning}
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
              <label>Certificate File (.pem/.crt)</label>
              <div className="file-input-group">
                <input
                  type="text"
                  placeholder="C:\certs\cert.pem"
                  value={tlsConfig?.certPath || ""}
                  onChange={(e) => onTlsConfigChange({ ...tlsConfig, certPath: e.target.value } as TlsConfig)}
                />
                <button
                  className="btn-browse"
                  onClick={handleBrowseCertFile}
                  type="button"
                >
                  Browse
                </button>
              </div>
            </div>
            <div className="form-group">
              <label>Private Key File (.key)</label>
              <div className="file-input-group">
                <input
                  type="text"
                  placeholder="C:\certs\key.pem"
                  value={tlsConfig?.keyPath || ""}
                  onChange={(e) => onTlsConfigChange({ ...tlsConfig, keyPath: e.target.value } as TlsConfig)}
                />
                <button
                  className="btn-browse"
                  onClick={handleBrowseKeyFile}
                  type="button"
                >
                  Browse
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
          <button
            className="btn-start"
            onClick={handleStartServer}
            disabled={isServerRunning}
          >
            Start Server
          </button>
          <button
            className="btn-stop"
            onClick={handleStopServer}
            disabled={!isServerRunning}
          >
            Stop Server
          </button>
        </div>
      </div>
    </div>
  );
}
