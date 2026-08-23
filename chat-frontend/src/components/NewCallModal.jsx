import { useMemo, useState } from "react"
import toast from "react-hot-toast"
import api from "../api/axios"
import { useCall } from "../context/CallContext"
import { useChats } from "../context/ChatsContext"
import { getAvatarColor } from "../utils/avatarColor"
import "./ContactsModal.css"
import "./CallsListModal.css"

function NewCallModal({ users, onClose, onCalled }) {
  const [search, setSearch] = useState("")
  const [dialingId, setDialingId] = useState(null)
  const { openCallPrompt } = useCall()
  const { conversations } = useChats()

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    const sorted = [...(users || [])].sort((a, b) =>
      (a.username || "").localeCompare(b.username || "")
    )
    if (!term) return sorted
    return sorted.filter((u) => u.username?.toLowerCase().includes(term))
  }, [users, search])

  const handleDial = async (user) => {
    if (dialingId) return
    setDialingId(user.id)
    try {
      const existing = conversations.find(
        (c) => c.type === "private" && c.other_participant?.id === user.id
      )

      let conversationId = existing?.id
      if (!conversationId) {
        const res = await api.post("/conversations/", {
          participant_id: user.id,
          type: "private",
        })
        conversationId = res.data.id
      }

      openCallPrompt(
        { id: user.id, username: user.username, avatarUrl: user.avatar_url },
        conversationId
      )
      onCalled()
    } catch (err) {
      console.error("Dial error:", err)
      toast.error("Could not start call")
    } finally {
      setDialingId(null)
    }
  }

  return (
    <div className="settings-modal-overlay" onClick={onClose}>
      <div className="settings-modal contacts-modal" onClick={(e) => e.stopPropagation()}>
        <div className="settings-modal-topbar">
          <h2>New Call</h2>
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
          <div className="calls-invite-link">🔗 Invite Via Link</div>

          {filtered.length === 0 && (
            <div className="contacts-empty">No contacts found</div>
          )}
          {filtered.map((user) => (
            <div key={user.id} className="contacts-list-item calls-dial-row">
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
              </div>
              <div className="contacts-info">
                <span className="contacts-name">{user.username}</span>
                <span className="contacts-sub">{user.email || "Tap to call"}</span>
              </div>
              <div className="calls-dial-icons">
                <button
                  className="calls-icon"
                  disabled={dialingId === user.id}
                  onClick={() => handleDial(user)}
                  title="Voice call"
                >
                  📞
                </button>
                <button
                  className="calls-icon"
                  disabled={dialingId === user.id}
                  onClick={() => handleDial(user)}
                  title="Video call"
                >
                  📹
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default NewCallModal
