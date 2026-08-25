import { useState } from "react"
import "./ForwardModal.css"
import { useChats } from "../../context/ChatsContext"
import { getAvatarColor } from "../../utils/avatarColor"

function ForwardModal({ onClose, onForward }) {
  const { conversations } = useChats()
  const [searchTerm, setSearchTerm] = useState("")

  const term = searchTerm.trim().toLowerCase()
  const filtered = conversations.filter((c) => {
    const name = c.type === "group" ? c.name : c.other_participant ? (c.other_participant.full_name || "Unknown") : "Saved Messages"
    return name.toLowerCase().includes(term)
  })

  return (
    <div className="forward-modal-overlay" onClick={onClose}>
      <div className="forward-modal" onClick={(e) => e.stopPropagation()}>
        <div className="forward-modal-header">
          <h3>Forward to...</h3>
          <button onClick={onClose}>×</button>
        </div>

        <input
          className="forward-modal-search"
          placeholder="Search chats..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          autoFocus
        />

        <div className="forward-modal-list">
          {filtered.length === 0 && (
            <div className="forward-modal-empty">No chats found</div>
          )}

          {filtered.map((c) => {
            const isGroup = c.type === "group"
            const isSaved = c.type === "private" && !c.other_participant
            const name = isSaved
              ? "Saved Messages"
              : isGroup
              ? c.name
              : (c.other_participant?.full_name || "Unknown")

            return (
              <div
                key={c.id}
                className="forward-modal-item"
                onClick={() => onForward(c.id)}
              >
                {isGroup ? (
                  <div className="forward-modal-avatar group">👥</div>
                ) : isSaved ? (
                  <div className="forward-modal-avatar saved">🔖</div>
                ) : c.other_participant?.avatar_url ? (
                  <img className="forward-modal-avatar" src={c.other_participant.avatar_url} alt={name} />
                ) : (
                  <div
                    className="forward-modal-avatar"
                    style={{ background: getAvatarColor(name) }}
                  >
                    {name?.[0]?.toUpperCase()}
                  </div>
                )}
                <span>{name}</span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export default ForwardModal
