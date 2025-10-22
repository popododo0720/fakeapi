import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Sidebar, ServerSettings, TlsConfig } from "./components/Sidebar";
import { TabBar } from "./components/TabBar";
import "./App.css";

export interface Endpoint {
  id: string;
  method: string;
  path: string;
  status: number;
  delay: number;
  response: string;
}

export interface ProjectData {
  name: string;
  lastSaved: string;
  endpoints: Endpoint[];
  settings: ServerSettings;
  tlsConfig: TlsConfig | null;
}

interface Tab {
  id: string;
  name: string;
  endpoints: Endpoint[];
  settings: ServerSettings;
  tlsConfig: TlsConfig | null;
  isServerRunning: boolean;
}

interface AppState {
  tabs: Tab[];
  activeTabId: string;
}

const STORAGE_KEY = "aka_app_state";

function App() {
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeTabId, setActiveTabId] = useState("");

  const [method, setMethod] = useState("GET");
  const [path, setPath] = useState("");
  const [status, setStatus] = useState(200);
  const [delay, setDelay] = useState(0);
  const [response, setResponse] = useState("");

  // 현재 활성화된 탭의 데이터
  const activeTab = tabs.find(t => t.id === activeTabId);
  const endpoints = activeTab?.endpoints || [];
  const serverSettings = activeTab?.settings || {
    port: 3000,
    bindAddr: "127.0.0.1",
    enableTls: false,
  };
  const tlsConfig = activeTab?.tlsConfig || null;

  // 초기 로드: localStorage에서 상태 복원 (엔드포인트는 제외)
  useEffect(() => {
    const savedState = localStorage.getItem(STORAGE_KEY);
    if (savedState) {
      try {
        const parsed: AppState = JSON.parse(savedState);
        // 엔드포인트 데이터를 제외하고 탭 메타데이터만 복원
        const migratedTabs = parsed.tabs.map(tab => ({
          id: tab.id,
          name: tab.name,
          endpoints: tab.endpoints || [], // 엔드포인트 데이터 유지 (탭 전환 시 사용)
          settings: {
            ...tab.settings,
            port: tab.settings?.port ?? 3000,
            bindAddr: tab.settings?.bindAddr ?? "127.0.0.1",
            enableTls: tab.settings?.enableTls ?? false,
          },
          tlsConfig: tab.tlsConfig || null,
          isServerRunning: false, // 앱 시작 시 모든 서버는 꺼진 상태
        }));
        setTabs(migratedTabs);
        setActiveTabId(parsed.activeTabId);
      } catch (error) {
        console.error("Failed to restore state:", error);
        initializeDefaultTab();
      }
    } else {
      initializeDefaultTab();
    }
  }, []);

  function initializeDefaultTab() {
    const defaultTab: Tab = {
      id: "1",
      name: "Untitled",
      endpoints: [],
      settings: {
        port: 3000,
        bindAddr: "127.0.0.1",
        enableTls: false,
      },
      tlsConfig: null,
      isServerRunning: false,
    };
    setTabs([defaultTab]);
    setActiveTabId("1");
  }

  // 탭 상태가 변경될 때마다 localStorage에 저장
  useEffect(() => {
    if (tabs.length > 0 && activeTabId) {
      const state: AppState = { tabs, activeTabId };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }
  }, [tabs, activeTabId]);

  useEffect(() => {
    if (activeTabId && tabs.length > 0) {
      // localStorage에서 최신 상태 다시 로드
      const savedState = localStorage.getItem(STORAGE_KEY);
      if (savedState) {
        try {
          const parsed: AppState = JSON.parse(savedState);
          const savedTab = parsed.tabs.find(t => t.id === activeTabId);
          if (savedTab) {
            // localStorage의 최신 데이터로 현재 탭만 업데이트
            setTabs(prevTabs =>
              prevTabs.map(tab =>
                tab.id === activeTabId
                  ? {
                      ...tab,
                      endpoints: savedTab.endpoints || [],
                      settings: {
                        ...savedTab.settings,
                        port: savedTab.settings?.port ?? 3000,
                        bindAddr: savedTab.settings?.bindAddr ?? "127.0.0.1",
                        enableTls: savedTab.settings?.enableTls ?? false,
                      },
                      tlsConfig: savedTab.tlsConfig || tab.tlsConfig,
                    }
                  : tab
              )
            );
          }
        } catch (error) {
          console.error("Failed to reload tab data:", error);
        }
      }

      const currentTab = tabs.find(t => t.id === activeTabId);
      if (currentTab) {
        // 백엔드 상태를 먼저 설정 (가져오기는 하지 않음)
        syncBackendStateForTab(currentTab);
      }
    }
  }, [activeTabId]);

  async function syncBackendStateForTab(tab: Tab) {
    try {
      // Rust 백엔드가 snake_case를 기대하므로 데이터를 변환
      const projectDataForRust = {
        name: tab.name,
        lastSaved: new Date().toISOString(),
        endpoints: tab.endpoints,
        settings: {
          port: tab.settings.port,
          bind_addr: tab.settings.bindAddr,
          enable_tls: tab.settings.enableTls,
        },
        tlsConfig: tab.tlsConfig ? {
          cert_path: tab.tlsConfig.certPath,
          key_path: tab.tlsConfig.keyPath,
        } : null,
      };
      // 백엔드 상태만 설정 (가져오지 않음 - UI 상태가 source of truth)
      await invoke("set_project_state", { projectData: projectDataForRust });
    } catch (error) {
      console.error("Failed to sync backend state:", error);
    }
  }

  async function handleAdd() {
    // Path validation
    if (!path) {
      alert("Path is required.");
      return;
    }

    if (!path.startsWith("/")) {
      alert("Path must start with '/'.");
      return;
    }

    // Status code validation
    if (status < 100 || status > 599) {
      alert("Status code must be between 100 and 599.");
      return;
    }

    // JSON response validation (if provided)
    if (response.trim() !== "") {
      try {
        JSON.parse(response);
      } catch (e) {
        alert("Invalid JSON format in response.");
        return;
      }
    }

    // 프론트엔드에서만 엔드포인트 생성 (백엔드 호출 안 함)
    const newEndpoint: Endpoint = {
      id: Date.now().toString() + Math.random().toString(36).substring(2, 11),
      method,
      path,
      status,
      delay,
      response,
    };

    // 현재 활성 탭에만 추가
    setTabs(prevTabs => {
      const updatedTabs = prevTabs.map(tab =>
        tab.id === activeTabId
          ? { ...tab, endpoints: [...tab.endpoints, newEndpoint] }
          : tab
      );
      
      // 서버가 실행 중인 경우 백엔드 상태 업데이트
      const currentTab = updatedTabs.find(t => t.id === activeTabId);
      if (currentTab && currentTab.isServerRunning) {
        const projectData: ProjectData = {
          name: currentTab.name,
          lastSaved: new Date().toISOString(),
          endpoints: currentTab.endpoints,
          settings: currentTab.settings,
          tlsConfig: currentTab.tlsConfig,
        };
        // 백그라운드에서 백엔드 상태 업데이트
        const projectDataForRust = {
          ...projectData,
          settings: {
            port: projectData.settings.port,
            bind_addr: projectData.settings.bindAddr,
            enable_tls: projectData.settings.enableTls,
          },
          tlsConfig: projectData.tlsConfig ? {
            cert_path: projectData.tlsConfig.certPath,
            key_path: projectData.tlsConfig.keyPath,
          } : null,
        };
        invoke("set_project_state", { projectData: projectDataForRust })
          .catch(error => {
            console.error("Failed to sync backend state after adding endpoint:", error);
            alert("Failed to update server with new endpoint: " + error);
          });
      }
      
      return updatedTabs;
    });

    setPath("");
    setResponse("");
    setStatus(200);
    setDelay(0);
  }

  function handleDelete(id: string) {
    // 프론트엔드에서만 삭제 (백엔드 호출 안 함)
    setTabs(prevTabs =>
      prevTabs.map(tab =>
        tab.id === activeTabId
          ? { ...tab, endpoints: tab.endpoints.filter(e => e.id !== id) }
          : tab
      )
    );
  }

  async function handleNewProject(startEditing: (tabId: string) => void) {
    let baseName = "Untitled";
    let newName = baseName;

    // 기존 탭 이름들 수집
    const existingNames = tabs.map(t => t.name);

    // 이름이 중복되면 숫자 찾기
    if (existingNames.includes(newName)) {
      let counter = 1;
      // 사용 가능한 가장 작은 숫자 찾기
      while (existingNames.includes(`${baseName}_${counter}`)) {
        counter++;
      }
      newName = `${baseName}_${counter}`;
    }

    const newTab: Tab = {
      id: Date.now().toString(),
      name: newName,
      endpoints: [],
      settings: {
        port: 3000,
        bindAddr: "127.0.0.1",
        enableTls: false,
      },
      tlsConfig: null,
      isServerRunning: false,
    };
    setTabs([...tabs, newTab]);
    setActiveTabId(newTab.id);

    // 백엔드 상태 초기화 (빈 프로젝트)
    try {
      const emptyProject: ProjectData = {
        name: newName,
        lastSaved: new Date().toISOString(),
        endpoints: [],
        settings: newTab.settings,
        tlsConfig: newTab.tlsConfig,
      };
      // Rust 백엔드가 snake_case를 기대하므로 데이터를 변환
      const emptyProjectForRust = {
        ...emptyProject,
        settings: {
          port: emptyProject.settings.port,
          bind_addr: emptyProject.settings.bindAddr,
          enable_tls: emptyProject.settings.enableTls,
        },
        tlsConfig: emptyProject.tlsConfig ? {
          cert_path: emptyProject.tlsConfig.certPath,
          key_path: emptyProject.tlsConfig.keyPath,
        } : null,
      };
      await invoke("set_project_state", { projectData: emptyProjectForRust });
    } catch (error) {
      console.error("Failed to initialize new project:", error);
    }

    // 탭 생성 후 즉시 편집 모드로 전환
    setTimeout(() => {
      startEditing(newTab.id);
    }, 0);
  }

  async function handleLoadProject() {
    try {
      const content: string = await invoke("load_project");
      if (content) {
        const projectData: ProjectData = JSON.parse(content);

        // Validate all endpoints before loading
        for (const endpoint of projectData.endpoints) {
          // Path validation
          if (!endpoint.path) {
            alert("Cannot load project: Path is required for all endpoints.");
            return;
          }

          if (!endpoint.path.startsWith("/")) {
            alert(`Cannot load project: Path must start with '/' (endpoint: ${endpoint.method} ${endpoint.path}).`);
            return;
          }

          // Status code validation
          if (endpoint.status < 100 || endpoint.status > 599) {
            alert(`Cannot load project: Status code must be between 100 and 599 (endpoint: ${endpoint.method} ${endpoint.path}).`);
            return;
          }

          // JSON response validation (if provided)
          if (endpoint.response.trim() !== "") {
            try {
              JSON.parse(endpoint.response);
            } catch (e) {
              alert(`Cannot load project: Invalid JSON format in response for endpoint ${endpoint.method} ${endpoint.path}.`);
              return;
            }
          }
        }

        // 중복 이름 체크 및 고유 이름 생성
        let projectName = projectData.name;
        let counter = 1;
        while (tabs.some(t => t.name === projectName)) {
          projectName = `${projectData.name} (${counter})`;
          counter++;
        }

        // 새 탭으로 프로젝트 로드
        const newTab: Tab = {
          id: Date.now().toString(),
          name: projectName,
          endpoints: projectData.endpoints,
          settings: {
            ...projectData.settings,
            port: projectData.settings?.port ?? 3000,
            bindAddr: projectData.settings?.bindAddr ?? "127.0.0.1",
            enableTls: projectData.settings?.enableTls ?? false,
          },
          tlsConfig: projectData.tlsConfig,
          isServerRunning: false,
        };
        setTabs([...tabs, newTab]);
        setActiveTabId(newTab.id);

        // Rust 백엔드가 snake_case를 기대하므로 데이터를 변환
        const projectDataForRust = {
          ...projectData,
          settings: {
            port: projectData.settings.port,
            bind_addr: projectData.settings.bindAddr,
            enable_tls: projectData.settings.enableTls,
          },
          tlsConfig: projectData.tlsConfig ? {
            cert_path: projectData.tlsConfig.certPath,
            key_path: projectData.tlsConfig.keyPath,
          } : null,
        };
        // 백엔드 상태도 업데이트
        await invoke("set_project_state", { projectData: projectDataForRust });

        alert(`Project "${projectName}" loaded successfully!`);
      }
    } catch (error) {
      console.error("Failed to load project:", error);
      alert(`Failed to load project: ${error}`);
    }
  }

  function handleTabRename(tabId: string, newName: string) {
    setTabs(prevTabs =>
      prevTabs.map(tab =>
        tab.id === tabId ? { ...tab, name: newName } : tab
      )
    );
  }

  async function handleSaveProject() {
    if (!activeTab) return;

    // Validate all endpoints before saving
    for (const endpoint of activeTab.endpoints) {
      // Path validation
      if (!endpoint.path) {
        alert("Cannot save project: Path is required for all endpoints.");
        return;
      }

      if (!endpoint.path.startsWith("/")) {
        alert(`Cannot save project: Path must start with '/' (endpoint: ${endpoint.method} ${endpoint.path}).`);
        return;
      }

      // Status code validation
      if (endpoint.status < 100 || endpoint.status > 599) {
        alert(`Cannot save project: Status code must be between 100 and 599 (endpoint: ${endpoint.method} ${endpoint.path}).`);
        return;
      }

      // JSON response validation (if provided)
      if (endpoint.response.trim() !== "") {
        try {
          JSON.parse(endpoint.response);
        } catch (e) {
          alert(`Cannot save project: Invalid JSON format in response for endpoint ${endpoint.method} ${endpoint.path}.`);
          return;
        }
      }
    }

    const projectData: ProjectData = {
      name: activeTab.name,
      lastSaved: new Date().toISOString(),
      endpoints: activeTab.endpoints,
      settings: serverSettings,
      tlsConfig,
    };

    // 파일명을 프로젝트 이름 + .json으로 설정
    const filename = `${activeTab.name}.json`;

    try {
      await invoke("save_project", {
        params: {
          data: JSON.stringify(projectData, null, 2),
          filename: filename
        }
      });
      alert("Project saved successfully!");
    } catch (error) {
      console.error("Failed to save project:", error);
      alert(`Failed to save project: ${error}`);
    }
  }

  function handleCloseTab(tabId: string) {
    const newTabs = tabs.filter(t => t.id !== tabId);
    setTabs(newTabs);

    // 마지막 탭을 닫으면 activeTabId를 빈 문자열로
    if (activeTabId === tabId) {
      if (newTabs.length > 0) {
        setActiveTabId(newTabs[0].id);
      } else {
        setActiveTabId("");
      }
    }
  }

  return (
    <div className="app-layout">
      <TabBar
        tabs={tabs.map(t => ({ id: t.id, name: t.name }))}
        activeTabId={activeTabId}
        onTabClick={setActiveTabId}
        onTabClose={handleCloseTab}
        onTabRename={handleTabRename}
        onNewProject={handleNewProject}
        onLoadProject={handleLoadProject}
      />

      <div className="app-body">
        <Sidebar
          settings={serverSettings}
          onSettingsChange={(newSettings) => {
            setTabs(prevTabs =>
              prevTabs.map(tab =>
                tab.id === activeTabId ? { ...tab, settings: newSettings } : tab
              )
            );
          }}
          tlsConfig={tlsConfig}
          onTlsConfigChange={(newTlsConfig) => {
            setTabs(prevTabs =>
              prevTabs.map(tab =>
                tab.id === activeTabId ? { ...tab, tlsConfig: newTlsConfig } : tab
              )
            );
          }}
          isServerRunning={activeTab?.isServerRunning || false}
          onServerStateChange={(isRunning) => {
            setTabs(prevTabs =>
              prevTabs.map(tab =>
                // 서버를 시작하면 현재 탭만 true, 나머지는 false
                // 서버를 종료하면 현재 탭만 false
                tab.id === activeTabId
                  ? { ...tab, isServerRunning: isRunning }
                  : { ...tab, isServerRunning: isRunning ? false : tab.isServerRunning }
              )
            );
          }}
          onServerStart={async () => {
            // 서버 시작 전에 현재 탭의 엔드포인트를 백엔드에 동기화
            const currentTab = tabs.find(t => t.id === activeTabId);
            if (currentTab) {
              try {
                // Rust 백엔드가 snake_case를 기대하므로 데이터를 변환
                const projectDataForRust = {
                  name: currentTab.name,
                  lastSaved: new Date().toISOString(),
                  endpoints: currentTab.endpoints,
                  settings: {
                    port: currentTab.settings.port,
                    bind_addr: currentTab.settings.bindAddr,
                    enable_tls: currentTab.settings.enableTls,
                  },
                  tlsConfig: currentTab.tlsConfig ? {
                    cert_path: currentTab.tlsConfig.certPath,
                    key_path: currentTab.tlsConfig.keyPath,
                  } : null,
                };
                console.log("Frontend projectData:", projectDataForRust);
                await invoke("set_project_state", { projectData: projectDataForRust });
              } catch (error) {
                console.error("Failed to sync backend state:", error);
                throw error;
              }
            }
          }}
        />

        <div className="main-content">
          {tabs.length === 0 ? (
            <div className="empty-workspace">
              <div className="empty-workspace-content">
                <h2>No Project Open</h2>
                <p>Create a new project or load an existing one to get started</p>
              </div>
            </div>
          ) : (
            <div className="container">
          <div className="form">
            <h2>Add New Endpoint</h2>

            <div className="form-row">
              <div className="form-group">
                <label>Method</label>
                <select value={method} onChange={(e) => setMethod(e.target.value)}>
                  <option>GET</option>
                  <option>POST</option>
                  <option>PUT</option>
                  <option>DELETE</option>
                  <option>PATCH</option>
                </select>
              </div>

              <div className="form-group flex-grow">
                <label>Path</label>
                <input
                  type="text"
                  placeholder="/api/users"
                  value={path}
                  onChange={(e) => setPath(e.target.value)}
                />
              </div>
            </div>
            
            <div className="form-row">
              <div className="form-group">
                <label>Status Code</label>
                <input
                  type="number"
                  value={status}
                  onChange={(e) => setStatus(Number(e.target.value))}
                  min={100}
                  max={599}
                />
              </div>
              <div className="form-group">
                <label>Delay (ms)</label>
                <input
                  type="number"
                  value={delay}
                  onChange={(e) => setDelay(Number(e.target.value))}
                  min={0}
                />
              </div>
            </div>

            <div className="form-group">
              <label>Response JSON</label>
              <textarea
                placeholder='{"status": "ok", "data": []}'
                value={response}
                onChange={(e) => setResponse(e.target.value)}
                rows={6}
              />
            </div>

            <button className="btn-add" onClick={handleAdd}>Add Endpoint</button>
          </div>

          <div className="endpoints">
            <div className="endpoints-header">
              <h2>Active Endpoints ({endpoints.length})</h2>
              <button className="btn-primary" onClick={handleSaveProject}>
                Save Project
              </button>
            </div>
            {endpoints.length === 0 ? (
              <div className="empty-state">
                <p>No endpoints configured yet</p>
                <p className="hint">Add your first endpoint above to get started</p>
              </div>
            ) : (
              <div className="endpoints-grid">
                {endpoints.map((ep) => (
                  <div key={ep.id} className="endpoint-card">
                    <div className="endpoint-header">
                      <div className="endpoint-method-path">
                        <span className={`method-badge ${ep.method.toLowerCase()}`}>
                          {ep.method}
                        </span>
                        <span className="endpoint-path">{ep.path}</span>
                      </div>
                      <button
                        className="btn-delete"
                        onClick={() => handleDelete(ep.id)}
                        title="Delete endpoint"
                      >
                        ×
                      </button>
                    </div>
                    <div className="endpoint-response">
                      <label>Response:</label>
                      <div className="endpoint-meta">
                        <span>Status: {ep.status}</span>
                        <span>Delay: {ep.delay}ms</span>
                      </div>
                      <pre>{ep.response}</pre>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;