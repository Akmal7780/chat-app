import { useEffect, useState } from "react"
import api from "../api/axios"
import { useCall } from "../context/CallContext"
import { getAvatarColor } from "../utils/avatarColor"
import NewCallModal from "./NewCallModal"
import "./ContactsModal.css"
import "./CallsListModal.css"

function formatCallTime(dateString) {
  const date = new Date(dateString)
  const now = new Date()
  const isToday = date.toDateString() === now.toDateString()
  const time = date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
  if (isToday) return time
  return `${date.toLocaleDateString([], { month: "long", day: "numeric" })} at ${time}`
}

// Groups consecutive entries with the same peer, Telegram-style
// ("Ukam ↗ (2)") — the list is already newest-first from the API.
function groupCalls(calls) {
  const groups = []
  for (const call of calls) {
    const last = groups[groups.length - 1]
    if (last && last.other_user.id === call.other_user.id) {
      last.count += 1
    } else {
      groups.push({ ...call, count: 1 })
    }
  }
  return groups
}

function CallsListModal({ users, onClose }) {
  const { openCallPrompt } = useCall()
  const [calls, setCalls] = useState([])
  const [loading, setLoading] = useState(true)
  const [showNewCall, setShowNewCall] = useState(false)

  const load = () => {
    setLoading(true)
    api.get("/calls/")
      .then((res) => setCalls(res.data))
      .catch((err) => console.error("Calls fetch error:", err))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
  }, [])

  const handleRedial = (call) => {
    openCallPrompt(
      {
        id: call.other_user.id,
        username: call.other_user.username,
        avatarUrl: call.other_user.avatar_url,
      },
      call.conversation_id
    )
    onClose()
  }

  const grouped = groupCalls(calls)

  if (showNewCall) {
    return (
      <NewCallModal
        users={users}
        onClose={() => setShowNewCall(false)}
        onCalled={() => { setShowNewCall(false); onClose() }}
      />
    )
  }

  return (
    <div className="settings-modal-overlay" onClick={onClose}>
      <div className="settings-modal contacts-modal" onClick={(e) => e.stopPropagation()}>
        <div className="settings-modal-topbar">
          <h2>Calls</h2>
          <div className="settings-modal-topbar-actions">
            <button className="settings-close-btn" onClick={onClose}>×</button>
          </div>
        </div>

        <button className="calls-start-new-btn" onClick={() => setShowNewCall(true)}>
          🔗 Start New Call
        </button>

        <div className="contacts-list">
          {loading ? (
            <div className="contacts-empty">Loading…</div>
          ) : grouped.length === 0 ? (
            <div className="contacts-empty">No calls yet</div>
          ) : (
            grouped.map((call) => {
              const missed = call.direction === "incoming" && call.call_status !== "completed"
              return (
                <button
                  key={call.id}
                  className="contacts-list-item"
                  onClick={() => handleRedial(call)}
                >
                  <div className="contacts-avatar">
                    {call.other_user.avatar_url ? (
                      <img src={call.other_user.avatar_url} alt={call.other_user.username} />
                    ) : (
                      <div
                        className="contacts-avatar-placeholder"
                        style={{ background: getAvatarColor(call.other_user.username) }}
                      >
                        {call.other_user.username?.[0]?.toUpperCase()}
                      </div>
                    )}
                  </div>
                  <div className="contacts-info">
                    <span className="contacts-name">{call.other_user.username}</span>
                    <span className={`calls-meta ${missed ? "missed" : ""}`}>
                      {call.direction === "outgoing" ? "↗" : "↙"}
                      {call.count > 1 && ` (${call.count})`} {formatCallTime(call.created_at)}
                    </span>
                  </div>
                  <span
                    className="calls-icon"
                    onClick={(e) => { e.stopPropagation(); handleRedial(call) }}
                    title={call.call_is_video ? "Video call" : "Voice call"}
                  >
                    {call.call_is_video ? "📹" : "📞"}
                  </span>
                </button>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}

export default CallsListModal
