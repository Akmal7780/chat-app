import { useEffect, useState } from "react"
import toast from "react-hot-toast"
import api from "../api/axios"
import { useChats } from "../context/ChatsContext"
import { getAvatarColor } from "../utils/avatarColor"
import "./ContactsModal.css"

function PublicChannelsModal({ onClose, onJoined }) {
  const { upsertConversation } = useChats()
  const [search, setSearch] = useState("")
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(true)
  const [joiningId, setJoiningId] = useState(null)

  useEffect(() => {
    const delay = setTimeout(() => {
      setLoading(true)
      api.get("/conversations/public/", { params: { search } })
        .then((res) => setResults(res.data))
        .catch((err) => console.error("Public channels fetch error:", err))
        .finally(() => setLoading(false))
    }, 300)

    return () => clearTimeout(delay)
  }, [search])

  const handleJoin = async (channel) => {
    setJoiningId(channel.id)
    try {
      const res = await api.post(`/conversations/${channel.id}/join/`)
      upsertConversation(res.data)
      onJoined(res.data)
    } catch (err) {
      if (err.response?.status === 400) {
        // Already a member — just open the channel instead of failing.
        upsertConversation(channel)
        onJoined(channel)
      } else {
        console.error("Join channel error:", err)
        toast.error("Failed to join channel")
      }
    } finally {
      setJoiningId(null)
    }
  }

  return (
    <div className="settings-modal-overlay" onClick={onClose}>
      <div className="settings-modal contacts-modal" onClick={(e) => e.stopPropagation()}>
        <div className="settings-modal-topbar">
          <h2>Public Channels</h2>
          <div className="settings-modal-topbar-actions">
            <button className="settings-close-btn" onClick={onClose}>×</button>
          </div>
        </div>

        <div className="contacts-search">
          <input
            type="text"
            placeholder="Search public channels"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
          />
        </div>

        <div className="contacts-list">
          {loading ? (
            <div className="contacts-empty">Loading…</div>
          ) : results.length === 0 ? (
            <div className="contacts-empty">No public channels found</div>
          ) : (
            results.map((channel) => (
              <button
                key={channel.id}
                className="contacts-list-item"
                onClick={() => handleJoin(channel)}
                disabled={joiningId === channel.id}
              >
                <div className="contacts-avatar">
                  {channel.avatar_url ? (
                    <img src={channel.avatar_url} alt={channel.name} />
                  ) : (
                    <div
                      className="contacts-avatar-placeholder"
                      style={{ background: getAvatarColor(channel.name) }}
                    >
                      {channel.name?.[0]?.toUpperCase()}
                    </div>
                  )}
                </div>
                <div className="contacts-info">
                  <span className="contacts-name">{channel.name}</span>
                  <span className="contacts-sub">
                    {channel.invite_slug ? `t.me/${channel.invite_slug} · ` : ""}
                    {channel.members_count} {channel.members_count === 1 ? "subscriber" : "subscribers"}
                  </span>
                </div>
                <span className="contacts-join-hint">
                  {joiningId === channel.id ? "Joining…" : "Join"}
                </span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

export default PublicChannelsModal
