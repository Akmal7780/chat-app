import { useRef, useState } from "react"
import toast from "react-hot-toast"
import { getTheme, applyTheme, getAutoNightMode, setAutoNightMode } from "../utils/theme"
import { getAccentColor, applyAccentColor } from "../utils/accentColor"
import { getAvatarColor } from "../utils/avatarColor"

const THEME_CARDS = [
  { id: "classic", label: "Classic", swatch: "#BFE9C0", bar: "#8FD7A0", real: "light" },
  { id: "day", label: "Day", swatch: "#AEE0F5", bar: "#7FCBEE", real: "day" },
  { id: "tinted", label: "Tinted", swatch: "#3B4654", bar: "#4A6FA5", real: "tinted" },
  { id: "night", label: "Night", swatch: "#232C39", bar: "#37465A", real: "dark" },
]

const ACCENT_COLORS = ["#3390EC", "#4CAF50", "#E9578B", "#F0932B", "#9B59B6", "#E74C3C", "#5D7290", "#F0C419"]

function ChatSettingsView({ user, onBack }) {
  const [theme, setTheme] = useState(() => getTheme())
  const [accentColor, setAccentColor] = useState(() => getAccentColor())
  const [autoNight, setAutoNight] = useState(() => getAutoNightMode())
  const colorInputRef = useRef(null)

  const handleThemeCardClick = (card) => {
    if (autoNight) {
      toast("Turn off Auto-night mode to pick a theme manually", { icon: "🌙" })
      return
    }
    setTheme(card.real)
    applyTheme(card.real)
  }

  const handleAccentClick = (color) => {
    setAccentColor(color)
    applyAccentColor(color)
  }

  const handleCustomAccent = (e) => {
    const color = e.target.value
    handleAccentClick(color)
  }

  const handleAutoNightToggle = () => {
    const next = !autoNight
    setAutoNight(next)
    setAutoNightMode(next)
    if (next) {
      // setAutoNightMode already applied the system-matched theme — reflect it here.
      setTheme(getTheme())
      toast.success("Auto-night mode follows your system's light/dark setting")
    }
  }

  const handleComingSoon = (label) => {
    toast(`${label} — coming soon`, { icon: "🚧" })
  }

  const isCardActive = (card) => card.real === theme

  return (
    <>
      <div className="settings-modal-topbar">
        <button className="settings-back-btn" onClick={onBack}>←</button>
        <h2>Chat Settings</h2>
        <div className="settings-modal-topbar-actions" />
      </div>

      <div className="settings-list">
        <div className="settings-list-section-label">Themes</div>

        <div className={`theme-card-row ${autoNight ? "theme-card-row-disabled" : ""}`}>
          {THEME_CARDS.map((card) => (
            <button
              key={card.id}
              className="theme-card"
              onClick={() => handleThemeCardClick(card)}
            >
              <div className="theme-card-preview" style={{ background: card.swatch }}>
                <div className="theme-card-preview-bar" />
                <div className="theme-card-preview-bar short" style={{ background: card.bar }} />
                <div className={`theme-card-radio ${isCardActive(card) ? "active" : ""}`} />
              </div>
              <span className="theme-card-label">{card.label}</span>
            </button>
          ))}
        </div>

        <div className="accent-color-row">
          {ACCENT_COLORS.map((color) => (
            <button
              key={color}
              className={`accent-color-swatch ${accentColor === color ? "active" : ""}`}
              style={{ background: color }}
              onClick={() => handleAccentClick(color)}
            />
          ))}
          <button
            className={`accent-color-swatch rainbow ${accentColor && !ACCENT_COLORS.includes(accentColor) ? "active" : ""}`}
            style={accentColor && !ACCENT_COLORS.includes(accentColor) ? { background: accentColor } : undefined}
            onClick={() => colorInputRef.current?.click()}
            title="Custom accent color"
          />
          <input
            ref={colorInputRef}
            type="color"
            value={accentColor || "#3390EC"}
            onChange={handleCustomAccent}
            style={{ position: "absolute", width: 0, height: 0, opacity: 0, pointerEvents: "none" }}
          />
        </div>
      </div>

      <div className="settings-list">
        <div className="settings-list-section-label">Theme settings</div>

        <button className="settings-list-item" onClick={() => handleComingSoon("Your name color")}>
          <span className="theme-setting-icon" style={{ background: "linear-gradient(135deg,#F0578B,#9B59B6)" }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
              <path d="M12 2C12 2 5 10.5 5 15a7 7 0 0 0 14 0c0-4.5-7-13-7-13Z" stroke="#fff" strokeWidth="2" strokeLinejoin="round" />
            </svg>
          </span>
          <span>Your name color</span>
          <span
            className="settings-list-value settings-name-pill"
            style={{ background: getAvatarColor(user?.username), color: "#fff" }}
          >
            {user?.username}
          </span>
        </button>

        <div className="settings-list-item settings-list-toggle">
          <span className="theme-setting-icon" style={{ background: "linear-gradient(135deg,#4A6FA5,#2C3E60)" }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
              <path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5Z" fill="#fff" />
            </svg>
          </span>
          <span>Auto-night mode</span>
          <label className="settings-switch">
            <input type="checkbox" checked={autoNight} onChange={handleAutoNightToggle} />
            <span className="settings-switch-slider" />
          </label>
        </div>

        <button className="settings-list-item" onClick={() => handleComingSoon("Font family")}>
          <span className="theme-setting-icon" style={{ background: "linear-gradient(135deg,#3390EC,#1C5FA8)" }}>
            <span className="theme-setting-icon-text">Aa</span>
          </span>
          <span>Font family</span>
          <span className="settings-list-value">Default</span>
        </button>
      </div>
    </>
  )
}

export default ChatSettingsView
