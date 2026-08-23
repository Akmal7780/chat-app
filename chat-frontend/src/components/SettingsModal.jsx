import { useEffect, useState } from "react"
import "./SettingsModal.css"
import { getTheme, applyTheme, isDarkFamily } from "../utils/theme"
import { getAvatarColor } from "../utils/avatarColor"
import NotificationsSettingsView from "./NotificationsSettingsView"
import PrivacySecurityView from "./PrivacySecurityView"
import ChatSettingsView from "./ChatSettingsView"
import FoldersView from "./FoldersView"
import AdvancedView from "./AdvancedView"
import LanguageView from "./LanguageView"
import { useLanguage } from "../utils/i18n"

function SettingsModal({ user, onClose, onEditProfile, onLogout, initialView }) {
  const [showMenu, setShowMenu] = useState(false)
  const [darkMode, setDarkMode] = useState(() => isDarkFamily(getTheme()))
  const [view, setView] = useState(initialView || "main")
  const { t, lang } = useLanguage()

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [onClose])

  const toggleDarkMode = () => {
    const next = !darkMode
    setDarkMode(next)
    applyTheme(next ? "dark" : "light")
  }

  const hasAvatar = user?.avatar_url && user.avatar_url.trim() !== ""

  if (view === "notifications") {
    return (
      <div className="settings-modal-overlay" onClick={onClose}>
        <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
          <NotificationsSettingsView onBack={() => setView("main")} />
        </div>
      </div>
    )
  }

  if (view === "privacy") {
    return (
      <div className="settings-modal-overlay" onClick={onClose}>
        <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
          <PrivacySecurityView onBack={() => setView("main")} />
        </div>
      </div>
    )
  }

  if (view === "chat-settings") {
    return (
      <div className="settings-modal-overlay" onClick={onClose}>
        <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
          <ChatSettingsView user={user} onBack={() => setView("main")} />
        </div>
      </div>
    )
  }

  if (view === "folders") {
    return (
      <div className="settings-modal-overlay" onClick={onClose}>
        <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
          <FoldersView
            onBack={() => setView("main")}
            onClose={onClose}
            standalone={initialView === "folders"}
          />
        </div>
      </div>
    )
  }

  if (view === "advanced") {
    return (
      <div className="settings-modal-overlay" onClick={onClose}>
        <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
          <AdvancedView onBack={() => setView("main")} />
        </div>
      </div>
    )
  }

  if (view === "language") {
    return (
      <div className="settings-modal-overlay" onClick={onClose}>
        <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
          <LanguageView onBack={() => setView("main")} />
        </div>
      </div>
    )
  }

  return (
    <div className="settings-modal-overlay" onClick={onClose}>
      <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="settings-modal-topbar">
          <h2>{t("settings_title")}</h2>
          <div className="settings-modal-topbar-actions">
            <button
              className="settings-kebab-btn"
              onClick={() => setShowMenu((prev) => !prev)}
            >
              ⋮
            </button>
            <button className="settings-close-btn" onClick={onClose}>
              ×
            </button>
          </div>

          {showMenu && (
            <div className="settings-kebab-menu">
              <button
                onClick={() => {
                  setShowMenu(false)
                  onEditProfile()
                }}
              >
                ✎ Edit profile
              </button>
              <button
                className="danger"
                onClick={() => {
                  setShowMenu(false)
                  onLogout()
                }}
              >
                🚪 Log out
              </button>
            </div>
          )}
        </div>

        <div
          className="settings-profile-header"
          onClick={onEditProfile}
        >
          <div className="settings-profile-avatar">
            {hasAvatar ? (
              <img src={user.avatar_url} alt="avatar" />
            ) : (
              <div
                className="settings-profile-avatar-placeholder"
                style={{ background: getAvatarColor(user?.username) }}
              >
                {user?.username?.[0]?.toUpperCase() || "U"}
              </div>
            )}
          </div>
          <div className="settings-profile-info">
            <h3>{user?.username}</h3>
            <span>{user?.email}</span>
          </div>
        </div>

        <div className="settings-list">
          <button className="settings-list-item" onClick={onEditProfile}>
            <span className="settings-list-icon">👤</span>
            <span>{t("settings_myAccount")}</span>
          </button>

          <button className="settings-list-item" onClick={() => setView("notifications")}>
            <span className="settings-list-icon">🔔</span>
            <span>{t("settings_notifications")}</span>
          </button>

          <button className="settings-list-item" onClick={() => setView("privacy")}>
            <span className="settings-list-icon">🔒</span>
            <span>{t("settings_privacy")}</span>
          </button>

          <button className="settings-list-item" onClick={() => setView("chat-settings")}>
            <span className="settings-list-icon">💬</span>
            <span>{t("settings_chatSettings")}</span>
          </button>

          <button className="settings-list-item" onClick={() => setView("folders")}>
            <span className="settings-list-icon">📁</span>
            <span>{t("settings_folders")}</span>
          </button>

          <button className="settings-list-item" onClick={() => setView("advanced")}>
            <span className="settings-list-icon">⚙️</span>
            <span>{t("settings_advanced")}</span>
          </button>

          <button className="settings-list-item" onClick={() => setView("language")}>
            <span className="settings-list-icon">🌐</span>
            <span>{t("settings_language")}</span>
            <span className="settings-list-value">{t(`language_name_${lang}`)}</span>
          </button>
        </div>

        <div className="settings-list">
          <div className="settings-list-item settings-list-toggle">
            <span className="settings-list-icon">🌙</span>
            <span>{t("settings_darkMode")}</span>
            <label className="settings-switch">
              <input
                type="checkbox"
                checked={darkMode}
                onChange={toggleDarkMode}
              />
              <span className="settings-switch-slider" />
            </label>
          </div>
        </div>

        <div className="settings-list">
          <button className="settings-list-item danger" onClick={onLogout}>
            <span className="settings-list-icon">🚪</span>
            <span>{t("settings_logout")}</span>
          </button>
        </div>
      </div>
    </div>
  )
}

export default SettingsModal
