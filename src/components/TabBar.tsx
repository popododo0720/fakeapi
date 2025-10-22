import { useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import "./TabBar.css";

interface Tab {
  id: string;
  name: string;
}

interface TabBarProps {
  tabs: Tab[];
  activeTabId: string;
  onTabClick: (tabId: string) => void;
  onTabClose: (tabId: string) => void;
  onTabRename: (tabId: string, newName: string) => void;
  onNewProject: (startEditing: (tabId: string) => void) => void;
  onLoadProject: () => void;
}

export function TabBar({
  tabs,
  activeTabId,
  onTabClick,
  onTabClose,
  onTabRename,
  onNewProject,
  onLoadProject,
}: TabBarProps) {
  const [showNewProjectMenu, setShowNewProjectMenu] = useState(false);
  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const appWindow = getCurrentWindow();

  function startEditingTab(tabId: string) {
    const tab = tabs.find(t => t.id === tabId);
    if (tab) {
      setEditingTabId(tabId);
      setEditingName(tab.name);
    }
  }

  function handleTabDoubleClick(tab: Tab) {
    setEditingTabId(tab.id);
    setEditingName(tab.name);
  }

  function handleNameSubmit(tabId: string) {
    const trimmedName = editingName.trim();
    if (trimmedName) {
      // 중복 이름 체크
      const isDuplicate = tabs.some(t => t.id !== tabId && t.name === trimmedName);
      if (isDuplicate) {
        alert(`A project named "${trimmedName}" already exists. Please choose a different name.`);
        return;
      }
      onTabRename(tabId, trimmedName);
    } else {
      // 빈 이름인 경우 기본값 유지
      const tab = tabs.find(t => t.id === tabId);
      if (tab) {
        setEditingName(tab.name);
      }
    }
    setEditingTabId(null);
  }

  function handleNameKeyDown(e: React.KeyboardEvent, tabId: string) {
    if (e.key === "Enter") {
      handleNameSubmit(tabId);
    } else if (e.key === "Escape") {
      setEditingTabId(null);
    }
  }

  return (
    <div className="tab-bar">
      <div className="tab-logo" data-tauri-drag-region>
        <span className="tab-logo-icon">⚡</span>
        <span className="tab-logo-text">AKA</span>
      </div>

      <div className="tab-bar-drag-area" data-tauri-drag-region></div>

      <div className="tabs">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className={`tab ${tab.id === activeTabId ? "active" : ""}`}
            onClick={() => onTabClick(tab.id)}
            onDoubleClick={() => handleTabDoubleClick(tab)}
          >
            {editingTabId === tab.id ? (
              <input
                type="text"
                className="tab-name-input"
                value={editingName}
                onChange={(e) => setEditingName(e.target.value)}
                onBlur={() => handleNameSubmit(tab.id)}
                onKeyDown={(e) => handleNameKeyDown(e, tab.id)}
                autoFocus
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <span className="tab-name">{tab.name}</span>
            )}
            <button
              className="tab-close"
              onClick={(e) => {
                e.stopPropagation();
                onTabClose(tab.id);
              }}
            >
              ×
            </button>
          </div>
        ))}
        <div className="tab-add-wrapper">
          <button
            className="tab-add"
            onClick={() => setShowNewProjectMenu(!showNewProjectMenu)}
          >
            +
          </button>
          {showNewProjectMenu && (
            <>
              <div
                className="menu-backdrop"
                onClick={() => setShowNewProjectMenu(false)}
              />
              <div className="project-menu">
                <button
                  onClick={() => {
                    onNewProject(startEditingTab);
                    setShowNewProjectMenu(false);
                  }}
                >
                  New Project
                </button>
                <button
                  onClick={() => {
                    onLoadProject();
                    setShowNewProjectMenu(false);
                  }}
                >
                  Load Project
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="window-controls">
        <button className="window-button minimize" onClick={() => appWindow.minimize()}>
          <svg width="10" height="10" viewBox="0 0 10 10">
            <path d="M0 5h10" stroke="currentColor" strokeWidth="1" />
          </svg>
        </button>
        <button className="window-button maximize" onClick={() => appWindow.toggleMaximize()}>
          <svg width="10" height="10" viewBox="0 0 10 10">
            <rect x="0" y="0" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="1" />
          </svg>
        </button>
        <button className="window-button close" onClick={() => appWindow.close()}>
          <svg width="10" height="10" viewBox="0 0 10 10">
            <path d="M0 0l10 10M10 0L0 10" stroke="currentColor" strokeWidth="1" />
          </svg>
        </button>
      </div>
    </div>
  );
}
