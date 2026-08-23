import { useEffect, useState } from "react"
import "./SidebarHeader.css"
import { useChats } from "../context/ChatsContext"
import { getFolderCounts } from "../utils/folderCounts"
import { hasPasscode, lock } from "../utils/localPasscode"
import { useLanguage } from "../utils/i18n"

const STORAGE_KEY = "chat_folder_tab"

function SidebarHeader({ searchTerm, onSearchChange, folderTab, onFolderChange, onOpenMenu }) {
  const { folders, conversations } = useChats()
  const { t } = useLanguage()
  const counts = getFolderCounts(conversations)

  const FOLDERS = [
    { key: "all", label: t("allChats") },
    { key: "private", label: t("private") },
    { key: "groups", label: t("groups") },
    { key: "channels", label: t("channels") },
    { key: "unread", label: t("unread") },
  ]
  return (
    <div className="sidebar-header">
      <div className="sidebar-search-row">
        <button className="sidebar-menu-btn" onClick={onOpenMenu} title="Menu">
          ☰
        </button>

        {hasPasscode() && (
          <button className="sidebar-menu-btn" onClick={lock} title="Lock">
            🔒
          </button>
        )}

        <div className="sidebar-search">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
            <path d="M21 21l-4.35-4.35" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <input
            type="text"
            placeholder={t("search")}
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
          />
          {searchTerm && (
            <button className="sidebar-search-clear" onClick={() => onSearchChange("")}>
              ✕
            </button>
          )}
        </div>
      </div>

      <div className="sidebar-folder-tabs">
        {FOLDERS.map((folder) => {
          const count = folder.key === "unread" ? counts.unread : counts[folder.key]
          return (
            <button
              key={folder.key}
              className={`folder-tab ${folderTab === folder.key ? "active" : ""}`}
              onClick={() => onFolderChange(folder.key)}
            >
              {folder.label}
              {count > 0 && <span className="folder-tab-badge">{count}</span>}
            </button>
          )
        })}
        {folders.map((folder) => {
          const key = `custom-${folder.id}`
          return (
            <button
              key={key}
              className={`folder-tab ${folderTab === key ? "active" : ""}`}
              onClick={() => onFolderChange(key)}
            >
              {folder.name}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function useFolderTab() {
  const [folderTab, setFolderTab] = useState(
    () => localStorage.getItem(STORAGE_KEY) || "all"
  )

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, folderTab)
  }, [folderTab])

  return [folderTab, setFolderTab]
}

export default SidebarHeader
