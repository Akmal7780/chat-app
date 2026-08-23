import { useState } from "react"
import { createPortal } from "react-dom"
import toast from "react-hot-toast"
import api from "../api/axios"
import { getAvatarColor } from "../utils/avatarColor"
import { extractFirstUrl } from "../utils/linkify"
import { formatLastSeen } from "../utils/formatTime"
import AddToFolderMenu from "./AddToFolderMenu"
import AutoDeletePicker, { autoDeleteLabel } from "./AutoDeletePicker"
import "./UserInfoModal.css"

function UserInfoModal({
  otherUser,
  conversationId,
  autoDeleteSeconds,
  isMuted,
  isOnline,
  messages,
  onClose,
  onMuteToggled,
  onBlockToggled,
  onAutoDeleteUpdated,
  onCall,
}) {
  const [showMore, setShowMore] = useState(false)
  const [showFolderPicker, setShowFolderPicker] = useState(false)
  const [showAutoDelete, setShowAutoDelete] = useState(false)
  const isBlocked = !!otherUser?.is_blocked_by_me

  const handleBlockToggle = async () => {
    try {
      const res = isBlocked
        ? await api.delete(`/users/block/${otherUser.id}/`)
        : await api.post(`/users/block/${otherUser.id}/`)
      onBlockToggled?.(res.data)
      toast.success(isBlocked ? "User unblocked" : "User blocked")
    } catch (err) {
      console.error("Block toggle error:", err)
      toast.error("Failed to update block status")
    }
  }

  const photos = messages.filter((m) => m.attachments?.some((a) => a.file_type === "image")).length
  const files = messages.filter((m) => m.attachments?.some((a) => a.file_type === "file")).length
  const voiceMessages = messages.filter((m) => m.attachments?.some((a) => a.file_type === "voice")).length
  const sharedLinks = messages.filter((m) => m.message_type === "text" && extractFirstUrl(m.content)).length

  const handleMute = async () => {
    if (!conversationId) return
    try {
      const action = isMuted ? "unmute" : "mute"
      const res = await api.post(`/conversations/${conversationId}/${action}/`)
      onMuteToggled?.(res.data)
    } catch (err) {
      console.error("Mute toggle error:", err)
    }
  }

  const handleExport = async () => {
    try {
      const res = await api.get("/messages/export/", {
        params: { conversation_id: conversationId },
        responseType: "blob",
      })

      const disposition = res.headers["content-disposition"] || ""
      const match = disposition.match(/filename="?([^"]+)"?/)
      const filename = match ? match[1] : `${otherUser?.username || "chat"}_export.txt`

      const url = window.URL.createObjectURL(res.data)
      const link = document.createElement("a")
      link.href = url
      link.download = filename
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
    } catch (err) {
      console.error("Export chat history error:", err)
      toast.error("Failed to export chat history")
    }
  }

  return createPortal(
    <div className="user-info-modal-overlay" onClick={onClose}>
      <div className="user-info-modal" onClick={(e) => e.stopPropagation()}>
        <button className="user-info-modal-close" onClick={onClose}>×</button>

        <div className="user-info-modal-avatar">
          {otherUser?.avatar_url ? (
            <img src={otherUser.avatar_url} alt={otherUser.username} />
          ) : (
            <div
              className="user-info-modal-avatar-placeholder"
              style={{ background: getAvatarColor(otherUser?.username) }}
            >
              {otherUser?.username?.[0]?.toUpperCase()}
            </div>
          )}
        </div>
        <h2>{otherUser?.username}</h2>
        <p className="user-info-modal-sub">
          {isOnline ? "online" : otherUser?.last_seen ? `last seen ${formatLastSeen(otherUser.last_seen)}` : "offline"}
        </p>

        {isBlocked && (
          <p className="user-info-modal-blocked-notice">🚫 You have blocked this user</p>
        )}

        <div className="user-info-modal-actions">
          <button className="user-info-modal-action" onClick={onClose} disabled={isBlocked}>
            💬
            <span>Message</span>
          </button>
          <button className="user-info-modal-action" onClick={handleMute}>
            {isMuted ? "🔕" : "🔔"}
            <span>{isMuted ? "Unmute" : "Mute"}</span>
          </button>
          <button className="user-info-modal-action" onClick={onCall} disabled={isBlocked}>
            📞
            <span>Call</span>
          </button>
          <button className="user-info-modal-action" onClick={() => setShowMore((v) => !v)}>
            •••
            <span>More</span>
          </button>
        </div>

        {showMore && (
          <div className="user-info-modal-more-menu">
            <button onClick={() => setShowAutoDelete((v) => !v)}>⏱️ Auto-Delete: {autoDeleteLabel(autoDeleteSeconds)}</button>
            {showAutoDelete && (
              <AutoDeletePicker
                conversationId={conversationId}
                currentSeconds={autoDeleteSeconds}
                onUpdated={(updated) => onAutoDeleteUpdated?.(updated)}
                className="user-info-folder-picker"
              />
            )}
            <button onClick={() => toast("Share this contact — coming soon", { icon: "🚧" })}>↗️ Share this contact</button>
            <button onClick={() => toast("Edit contact — coming soon", { icon: "🚧" })}>✏️ Edit contact</button>
            <button onClick={() => toast("Send a Gift — coming soon", { icon: "🚧" })}>🎁 Send a Gift</button>
            <button onClick={handleExport}>📤 Export chat history</button>
            <button onClick={() => toast("Disable Sharing — coming soon", { icon: "🚧" })}>🚫 Disable Sharing</button>
            <button onClick={() => setShowFolderPicker((v) => !v)}>📁 Add to folder</button>
            {showFolderPicker && (
              <AddToFolderMenu conversationId={conversationId} className="user-info-folder-picker" />
            )}
            <button onClick={handleBlockToggle}>{isBlocked ? "✅ Unblock user" : "✋ Block user"}</button>
            <button className="danger" onClick={() => toast("Delete contact — coming soon", { icon: "🚧" })}>🗑️ Delete contact</button>
          </div>
        )}

        <div className="user-info-modal-details">
          <div className="user-info-modal-row">
            <span className="user-info-modal-value">{otherUser?.email}</span>
            <span className="user-info-modal-label">Email</span>
          </div>
          {otherUser?.username && (
            <div className="user-info-modal-row">
              <span className="user-info-modal-value">@{otherUser.username}</span>
              <span className="user-info-modal-label">Username</span>
            </div>
          )}
          {otherUser?.bio && (
            <div className="user-info-modal-row">
              <span className="user-info-modal-value">{otherUser.bio}</span>
              <span className="user-info-modal-label">Bio</span>
            </div>
          )}
        </div>

        <div className="user-info-modal-stats">
          <div className="user-info-modal-stat-row">🖼️ {photos} photos</div>
          <div className="user-info-modal-stat-row">📄 {files} files</div>
          <div className="user-info-modal-stat-row">🎤 {voiceMessages} voice messages</div>
          <div className="user-info-modal-stat-row">🔗 {sharedLinks} shared links</div>
        </div>
      </div>
    </div>,
    document.body
  )
}

export default UserInfoModal
