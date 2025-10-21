import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Sidebar } from "./components/Sidebar";
import "./App.css";

interface Endpoint {
  id: string;
  method: string;
  path: string;
  response: string;
}

function App() {
  const [endpoints, setEndpoints] = useState<Endpoint[]>([]);
  const [method, setMethod] = useState("GET");
  const [path, setPath] = useState("");
  const [response, setResponse] = useState("");

  useEffect(() => {
    loadEndpoints();
  }, []);

  async function loadEndpoints() {
    const data = await invoke<Endpoint[]>("get_endpoints");
    setEndpoints(data);
  }

  async function handleAdd() {
    try {
      await invoke("add_endpoint", { method, path, response });
      setPath("");
      setResponse("");
      loadEndpoints();
    } catch (error) {
      console.error(error);
    }
  }

  async function handleDelete(id: string) {
    try {
      await invoke("delete_endpoint", { id });
      loadEndpoints();
    } catch (error) {
      console.error(error);
    }
  }

  return (
    <div className="app-layout">
      <Sidebar />

      <div className="main-content">
        <div className="container">
          <h1>Endpoints Management</h1>

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
            <h2>Active Endpoints ({endpoints.length})</h2>
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
                      <pre>{ep.response}</pre>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;