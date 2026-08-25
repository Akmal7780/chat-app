import { useEffect, useState } from "react"
import toast from "react-hot-toast"
import api from "../../api/axios"
import { formatLastSeen } from "../../utils/formatTime"

function ActiveSessionsView({ onBack }) {
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get("/users/sessions/")
      .then((res) => setSessions(res.data))
      .catch((err) => console.error("Sessions fetch error:", err))
      .finally(() => setLoading(false))
  }, [])

  const handleTerminate = async (session) => {
    try {
      await api.delete(`/users/sessions/${session.id}/`)
      setSessions((prev) => prev.filter((s) => s.id !== session.id))
      toast.success("Session terminated")
    } catch (err) {
      console.error("Terminate session error:", err)
      toast.error("Failed to terminate session")
    }
  }

  const current = sessions.find((s) => s.is_current)
  const others = sessions.filter((s) => !s.is_current)

  return (
    <>
      <div className="settings-modal-topbar">
        <button className="settings-back-btn" onClick={onBack}>←</button>
        <h2>Active Sessions</h2>
        <div className="settings-modal-topbar-actions" />
      </div>

      {loading ? (
        <div className="settings-list">
          <div className="folders-list-item settings-list-item">Loading…</div>
        </div>
      ) : (
        <>
          {current && (
            <div className="settings-list">
              <div className="settings-list-section-label">This device</div>
              <div className="session-row">
                <div className="session-row-text">
                  <span className="session-row-device">{current.device}</span>
                  <small>{current.ip_address} · active now</small>
                </div>
                <span className="session-row-current-badge">Current</span>
              </div>
            </div>
          )}

          <div className="settings-list">
            <div className="settings-list-section-label">Other sessions</div>
            {others.length === 0 ? (
              <div className="folders-list-item settings-list-item">No other active sessions</div>
            ) : (
              others.map((session) => (
                <div key={session.id} className="session-row">
                  <div className="session-row-text">
                    <span className="session-row-device">{session.device}</span>
                    <small>
                      {session.ip_address} · last active {formatLastSeen(session.last_seen_at)}
                    </small>
                  </div>
                  <button
                    className="session-row-terminate"
                    onClick={() => handleTerminate(session)}
                  >
                    Terminate
                  </button>
                </div>
              ))
            )}
          </div>
        </>
      )}
    </>
  )
}

export default ActiveSessionsView
