import { useMemo, useState } from "react"
import "./ContactsModal.css"
import { getAvatarColor } from "../utils/avatarColor"
import { useOnlineUsers } from "../context/OnlineUsersContext"

function ContactsModal({ users, onClose, onSelectContact }) {
  const [search, setSearch] = useState("")
  const { onlineUsers } = useOnlineUsers()

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    const sorted = [...(users || [])].sort((a, b) =>
      (a.username || "").localeCompare(b.username || "")
    )
    if (!term) return sorted
    return sorted.filter((u) => u.username?.toLowerCase().includes(term))
  }, [users, search])

  return (
    <div className="settings-modal-overlay" onClick={onClose}>
      <div className="settings-modal contacts-modal" onClick={(e) => e.stopPropagation()}>
        <div className="settings-modal-topbar">
          <h2>Contacts</h2>
          <div className="settings-modal-topbar-actions">
            <button className="settings-close-btn" onClick={onClose}>×</button>
          </div>
        </div>

        <div className="contacts-search">
          <input
            type="text"
            placeholder="Search contacts"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
          />
        </div>

        <div className="contacts-list">
          {filtered.length === 0 && (
            <div className="contacts-empty">No contacts found</div>
          )}
          {filtered.map((user) => (
            <button
              key={user.id}
              className="contacts-list-item"
              onClick={() => onSelectContact(user)}
            >
              <div className="contacts-avatar">
                {user.avatar_url || user.avatar ? (
                  <img src={user.avatar_url || user.avatar} alt={user.username} />
                ) : (
                  <div
                    className="contacts-avatar-placeholder"
                    style={{ background: getAvatarColor(user.username) }}
                  >
                    {user.username?.[0]?.toUpperCase()}
                  </div>
                )}
                {onlineUsers?.has(Number(user.id)) && <span className="contacts-online-dot" />}
              </div>
              <div className="contacts-info">
                <span className="contacts-name">{user.username}</span>
                <span className="contacts-sub">{user.email || "Tap to message"}</span>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

export default ContactsModal
