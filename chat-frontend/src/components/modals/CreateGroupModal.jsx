import { useState, useEffect, useRef } from "react"
import toast from "react-hot-toast"
import api from "../../api/axios"
import { useChats } from "../../context/ChatsContext"
import { formatLastSeen } from "../../utils/formatTime"

// Two-step flow matching Telegram's real "New Group" flow: a small popup for
// the name/photo first, then a separate full member-picker screen — instead
// of one large combined form.
function CreateGroupModal({ users, onClose, onCreated }) {
  const { upsertConversation } = useChats()
  const [step, setStep] = useState("info") // info | members
  const [name, setName] = useState("")
  const [avatarFile, setAvatarFile] = useState(null)
  const [avatarPreview, setAvatarPreview] = useState("")
  const [selectedUsers, setSelectedUsers] = useState([])
  const [searchTerm, setSearchTerm] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const fileInputRef = useRef(null)

  useEffect(() => {
    return () => {
      if (avatarPreview) URL.revokeObjectURL(avatarPreview)
    }
  }, [avatarPreview])

  const handleAvatarSelect = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (avatarPreview) URL.revokeObjectURL(avatarPreview)
    setAvatarFile(file)
    setAvatarPreview(URL.createObjectURL(file))
  }

  const filteredUsers = users.filter(user =>
    user.username?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.email?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const toggleUser = (id) => {
    setSelectedUsers(prev =>
      prev.includes(id) ? prev.filter(u => u !== id) : [...prev, id]
    )
  }

  const selectAll = () => {
    if (selectedUsers.length === filteredUsers.length) {
      setSelectedUsers([])
    } else {
      setSelectedUsers(filteredUsers.map(u => u.id))
    }
  }

  const createGroup = async () => {
    if (selectedUsers.length < 2) {
      setError("Please select at least 2 members")
      return
    }

    setLoading(true)
    setError("")

    try {
      const res = await api.post("/conversations/", {
        type: "group",
        name: name.trim(),
        participant_ids: selectedUsers
      })

      if (avatarFile) {
        const formData = new FormData()
        formData.append("avatar", avatarFile)
        try {
          await api.patch(`/conversations/${res.data.id}/`, formData, {
            headers: { "Content-Type": "multipart/form-data" },
          })
        } catch {
          toast.error("Group created, but the photo couldn't be saved")
        }
      }

      upsertConversation(res.data)
      onCreated(res.data)
      onClose()
    } catch (error) {
      console.error("Create group error", error)
      setError(error.response?.data?.message || "Failed to create group. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  const getAvatarColor = (name = "") => {
    const colors = [
      "#f44336", "#e91e63", "#9c27b0", "#673ab7", "#3f51b5",
      "#2196f3", "#009688", "#4caf50", "#ff9800", "#795548"
    ]
    let hash = 0
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash)
    }
    return colors[Math.abs(hash) % colors.length]
  }

  const handleKeyDown = (e) => {
    if (e.key === "Escape") onClose()
    else if (e.key === "Enter") {
      if (step === "info" && name.trim()) setStep("members")
      else if (step === "members" && e.ctrlKey) createGroup()
    }
  }

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [step, name, selectedUsers])

  if (step === "info") {
    return (
      <div className="create-group-modal-overlay" onClick={onClose}>
        <div className="create-group-modal step-info" onClick={e => e.stopPropagation()}>
          <div className="group-info-step-body">
            <div className="avatar-preview-wrapper">
              <div className="avatar-preview-container">
                {avatarPreview ? (
                  <img src={avatarPreview} alt="Group avatar" className="avatar-preview" />
                ) : (
                  <div className="avatar-placeholder" style={{ background: "var(--primary-gradient)" }}>
                    <span className="upload-icon">📷</span>
                  </div>
                )}
              </div>
              <button
                type="button"
                className="avatar-camera-btn"
                onClick={() => fileInputRef.current?.click()}
                title="Choose photo"
              >
                📷
              </button>
            </div>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleAvatarSelect}
              accept="image/*"
              style={{ display: "none" }}
            />

            <div className="group-info-step-field">
              <label>Group name</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g., Project Team, Friends, Family"
                autoFocus
                maxLength={50}
              />
            </div>
          </div>

          <div className="group-info-step-actions">
            <button onClick={onClose}>Cancel</button>
            <button onClick={() => name.trim() && setStep("members")} disabled={!name.trim()}>Next</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="create-group-modal-overlay" onClick={onClose}>
      <div className="create-group-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Add Members</h2>
          <span className="members-count">{selectedUsers.length} / 200000</span>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        <div className="modal-content">
          <div className="search-members">
            <input
              type="text"
              placeholder="Search"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              autoFocus
            />
          </div>

          {filteredUsers.length > 0 && (
            <div className="select-actions">
              <button className="select-all-btn" onClick={selectAll}>
                {selectedUsers.length === filteredUsers.length ? "Clear All" : "Select All"}
              </button>
            </div>
          )}

          <div className="members-list">
            {filteredUsers.length === 0 ? (
              <div className="no-results">
                {searchTerm ? "No users match your search" : "No users available"}
              </div>
            ) : (
              filteredUsers.map(user => (
                <div
                  key={user.id}
                  className={`member-item ${selectedUsers.includes(user.id) ? "selected" : ""}`}
                  onClick={() => toggleUser(user.id)}
                >
                  <div className="member-checkbox">
                    {selectedUsers.includes(user.id) && "✓"}
                  </div>

                  <div
                    className="member-avatar-small"
                    style={{ backgroundColor: getAvatarColor(user.username) }}
                  >
                    {(user.full_name || "Unknown")[0].toUpperCase()}
                  </div>

                  <div className="member-info">
                    <div className="member-name">{user.full_name || "Unknown"}</div>
                    <div className="member-email">
                      {user.last_seen ? `last seen ${formatLastSeen(user.last_seen)}` : (user.email || "")}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {error && <div className="error-message">{error}</div>}
        </div>

        <div className="modal-footer">
          <button className="cancel-btn" onClick={() => setStep("info")} disabled={loading}>
            Back
          </button>
          <button
            className="create-btn"
            onClick={createGroup}
            disabled={loading || selectedUsers.length < 2}
          >
            {loading ? (
              <>
                <span className="btn-spinner"></span>
                <span>Creating...</span>
              </>
            ) : (
              <span>Create</span>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

export default CreateGroupModal
