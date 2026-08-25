import { useEffect, useState } from "react"
import toast from "react-hot-toast"
import api from "../../api/axios"
import { getAvatarColor } from "../../utils/avatarColor"

function BlockedUsersView({ onBack }) {
  const [blockedUsers, setBlockedUsers] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get("/users/blocked/")
      .then((res) => setBlockedUsers(res.data.results || res.data))
      .catch((err) => console.error("Blocked users fetch error:", err))
      .finally(() => setLoading(false))
  }, [])

  const handleUnblock = async (user) => {
    try {
      await api.delete(`/users/block/${user.id}/`)
      setBlockedUsers((prev) => prev.filter((u) => u.id !== user.id))
      toast.success(`${user.full_name || "Unknown"} unblocked`)
    } catch (err) {
      console.error("Unblock error:", err)
      toast.error("Failed to unblock user")
    }
  }

  return (
    <>
      <div className="settings-modal-topbar">
        <button className="settings-back-btn" onClick={onBack}>←</button>
        <h2>Blocked Users</h2>
        <div className="settings-modal-topbar-actions" />
      </div>

      <div className="settings-list">
        {loading ? (
          <div className="folders-list-item settings-list-item">Loading…</div>
        ) : blockedUsers.length === 0 ? (
          <div className="folders-list-item settings-list-item">No blocked users</div>
        ) : (
          blockedUsers.map((user) => (
            <div key={user.id} className="settings-list-item folders-list-item">
              <span
                className="blocked-user-avatar"
                style={{ background: getAvatarColor(user.username) }}
              >
                {(user.full_name || "Unknown")[0].toUpperCase()}
              </span>
              <span className="settings-list-item-text">{user.full_name || "Unknown"}</span>
              <button className="folders-delete-btn" onClick={() => handleUnblock(user)} title="Unblock">
                Unblock
              </button>
            </div>
          ))
        )}
      </div>
    </>
  )
}

export default BlockedUsersView
