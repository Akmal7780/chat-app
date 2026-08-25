import { useState } from "react"
import toast from "react-hot-toast"
import { useChats } from "../../context/ChatsContext"
import { getAvatarColor } from "../../utils/avatarColor"

// Lets the user pick one of the channels they created as their "Personal
// channel". Reuses the already-loaded conversations list instead of a
// dedicated endpoint — ownership is exactly `created_by === currentUser.id`.
function PersonalChannelView({ currentUser, currentChannelId, onBack, onSaved }) {
  const { conversations } = useChats()
  const [selectedId, setSelectedId] = useState(currentChannelId || null)
  const [saving, setSaving] = useState(false)

  const ownedChannels = conversations.filter(
    (c) => c.type === "channel" && c.created_by === currentUser.id
  )

  const handleDone = async () => {
    setSaving(true)
    try {
      await onSaved(selectedId)
      onBack()
    } catch {
      toast.error("Failed to save personal channel")
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div className="settings-modal-topbar">
        <button className="settings-back-btn" onClick={onBack}>←</button>
        <h2>Personal channel</h2>
        <div className="settings-modal-topbar-actions">
          <button className="settings-topbar-link" onClick={handleDone} disabled={saving}>
            {saving ? "…" : "Done"}
          </button>
        </div>
      </div>

      <div className="settings-list">
        {ownedChannels.length === 0 ? (
          <div className="folders-list-item settings-list-item">You don't own any channels yet</div>
        ) : (
          ownedChannels.map((c) => (
            <button
              key={c.id}
              className="settings-list-item folders-list-item"
              onClick={() => setSelectedId(selectedId === c.id ? null : c.id)}
            >
              {c.avatar_url ? (
                <img className="blocked-user-avatar" src={c.avatar_url} alt={c.name} style={{ objectFit: "cover" }} />
              ) : (
                <span className="blocked-user-avatar" style={{ background: getAvatarColor(c.name) }}>
                  {c.name?.[0]?.toUpperCase()}
                </span>
              )}
              <span className="settings-list-item-text">
                <span>{c.name}</span>
                <small>{c.members_count} {c.members_count === 1 ? "subscriber" : "subscribers"}</small>
              </span>
              {selectedId === c.id && <span className="settings-list-value">✓</span>}
            </button>
          ))
        )}
      </div>
    </>
  )
}

export default PersonalChannelView
