import "./FolderRail.css"
import { useChats } from "../context/ChatsContext"
import { getFolderCounts } from "../utils/folderCounts"
import { hasPasscode, lock } from "../utils/localPasscode"
import { useLanguage } from "../utils/i18n"

function FolderRail({ folderTab, onFolderChange, onOpenMenu, onOpenFolders }) {
  const { conversations, folders } = useChats()
  const { t } = useLanguage()
  const counts = getFolderCounts(conversations)

  const allChatsIcon = (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path
        d="M10,2 H18 A3,3 0 0 1 21,5 V9 A3,3 0 0 1 18,12 H13 L11,15 L10,12 A3,3 0 0 1 7,9 V5 A3,3 0 0 1 10,2 Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        className="rail-bubble-mask"
        d="M6,9 H14 A3,3 0 0 1 17,12 V16 A3,3 0 0 1 14,19 H9 L7,22 L6,19 A3,3 0 0 1 3,16 V12 A3,3 0 0 1 6,9 Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  )

  const privateIcon = (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="1.7" />
      <path d="M4.5 20c0-4.2 3.4-7 7.5-7s7.5 2.8 7.5 7" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  )

  const groupsIcon = (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <circle cx="16.3" cy="7.6" r="2.6" stroke="currentColor" strokeWidth="1.5" opacity="0.7" />
      <path d="M14.7 12.3c2.5.4 4.4 2.5 4.6 5.6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.7" />
      <circle cx="9" cy="8.2" r="3.4" stroke="currentColor" strokeWidth="1.7" />
      <path d="M3 19c0-3.7 2.7-6.1 6-6.1s6 2.4 6 6.1" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  )

  const channelsIcon = (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path
        d="M4 10.2v3.6a1.6 1.6 0 0 0 1.6 1.6h1L11.2 20c.7.6 1.8.1 1.8-.8V4.8c0-.9-1.1-1.4-1.8-.8L6.6 8.6h-1A1.6 1.6 0 0 0 4 10.2Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M16.8 9.3a3.6 3.6 0 0 1 0 5.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M19.3 7a7 7 0 0 1 0 10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" opacity="0.6" />
    </svg>
  )

  const unreadIcon = (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path
        d="M10,2 H18 A3,3 0 0 1 21,5 V9 A3,3 0 0 1 18,12 H13 L11,15 L10,12 A3,3 0 0 1 7,9 V5 A3,3 0 0 1 10,2 Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <circle cx="6" cy="18" r="2.3" fill="currentColor" />
    </svg>
  )

  const BUILT_IN_FOLDERS = [
    { key: "all", label: t("allChats"), icon: allChatsIcon },
    { key: "private", label: t("private"), icon: privateIcon },
    { key: "groups", label: t("groups"), icon: groupsIcon },
    { key: "channels", label: t("channels"), icon: channelsIcon },
    { key: "unread", label: t("unread"), icon: unreadIcon },
  ]

  return (
    <div className="folder-rail">
      <button className="folder-rail-menu-btn" onClick={onOpenMenu} title="Menu">
        ☰
      </button>

      {hasPasscode() && (
        <button className="folder-rail-menu-btn" onClick={lock} title="Lock">
          🔒
        </button>
      )}

      <div className="folder-rail-list">
        {BUILT_IN_FOLDERS.map(({ key, label, icon }) => {
          const count = key === "unread" ? counts.unread : counts[key]
          return (
            <button
              key={key}
              className={`folder-rail-item ${folderTab === key ? "active" : ""}`}
              onClick={() => onFolderChange(key)}
            >
              <span className="folder-rail-icon">
                {icon}
                {count > 0 && <span className="folder-rail-badge">{count}</span>}
              </span>
              <span className="folder-rail-label">{label}</span>
            </button>
          )
        })}

        {folders.map((folder) => {
          const key = `custom-${folder.id}`
          return (
            <button
              key={key}
              className={`folder-rail-item ${folderTab === key ? "active" : ""}`}
              onClick={() => onFolderChange(key)}
            >
              <span className="folder-rail-icon">📁</span>
              <span className="folder-rail-label">{folder.name}</span>
            </button>
          )
        })}
      </div>

      <button className="folder-rail-edit-btn" onClick={onOpenFolders} title="Edit folders">
        <span className="folder-rail-icon">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <line x1="4" y1="7" x2="20" y2="7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            <circle cx="9" cy="7" r="2.5" fill="currentColor" />
            <line x1="4" y1="17" x2="20" y2="17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            <circle cx="15" cy="17" r="2.5" fill="currentColor" />
          </svg>
        </span>
        <span className="folder-rail-label">{t("edit")}</span>
      </button>
    </div>
  )
}

export default FolderRail
