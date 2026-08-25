import { useState } from "react"
import toast from "react-hot-toast"
import { getAvatarColor } from "../../utils/avatarColor"
import "./NameColorView.css"

// Real, persisted per-user accent color (User.name_color) — chosen from a
// fixed Telegram-style palette. "Add icons to Profile" has no matching
// feature anywhere in this app (no profile-badge concept), so it stays a
// static, non-functional row like the other coming-soon items.
const PALETTE = [
  "#e05a4e", "#e0994e", "#9b59d0", "#4caf50", "#38a3c4", "#3b82f6", "#d0507f", "#8a97a8",
  "#f0836b", "#e0b84e", "#c86ee0", "#7cc46e", "#6ec4c4", "#6ea3e0", "#f08ba0", "#a8b0ba",
]

function NameColorView({ user, onBack, onSaved }) {
  const [tab, setTab] = useState("profile")
  const [selected, setSelected] = useState(user.name_color || "")
  const [saving, setSaving] = useState(false)

  const displayName = user.full_name || "Unknown"

  const handlePick = async (color) => {
    const next = selected === color ? "" : color
    setSelected(next)
    setSaving(true)
    try {
      await onSaved(next)
    } catch {
      toast.error("Failed to save color")
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div className="settings-modal-topbar">
        <button className="settings-back-btn" onClick={onBack}>←</button>
        <h2>Color preview</h2>
        <div className="settings-modal-topbar-actions" />
      </div>

      <div className="namecolor-tabs">
        <button className={tab === "profile" ? "active" : ""} onClick={() => setTab("profile")}>Profile</button>
        <button className={tab === "name" ? "active" : ""} onClick={() => setTab("name")}>Name</button>
      </div>

      <div className="namecolor-preview">
        <div className="namecolor-avatar-ring" style={{ borderColor: selected || "transparent" }}>
          {user.avatar_url ? (
            <img src={user.avatar_url} alt={displayName} />
          ) : (
            <div className="namecolor-avatar-placeholder" style={{ background: getAvatarColor(user.username) }}>
              {displayName[0]?.toUpperCase()}
            </div>
          )}
        </div>
        <div className="namecolor-name" style={{ color: selected || undefined }}>{displayName}</div>
        <div className="namecolor-status">online</div>
      </div>

      <div className="namecolor-swatches">
        {PALETTE.map((c) => (
          <button
            key={c}
            className={`namecolor-swatch ${selected === c ? "selected" : ""}`}
            style={{ background: c }}
            onClick={() => handlePick(c)}
            disabled={saving}
          />
        ))}
      </div>

      <div className="settings-list">
        <button
          className="settings-list-item"
          onClick={() => toast("Add icons to Profile — coming soon", { icon: "🚧" })}
        >
          <span>✏️ Add icons to Profile</span>
          <span className="settings-list-value">Off</span>
        </button>
      </div>
    </>
  )
}

export default NameColorView
