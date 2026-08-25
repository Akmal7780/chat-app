import { useEffect, useRef, useState } from "react"
import api from "../../api/axios"
import { useChats } from "../../context/ChatsContext"
import { getAvatarColor } from "../../utils/avatarColor"
import { slugify } from "../../utils/slugify"

function CreateChannelModal({ users, onClose, onCreated }) {
  const { upsertConversation } = useChats()
  const [step, setStep] = useState("info") // info | privacy | members

  // Step 1: info
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [avatarFile, setAvatarFile] = useState(null)
  const [avatarPreview, setAvatarPreview] = useState(null)
  const fileInputRef = useRef(null)

  // Step 2: privacy
  const [isPublic, setIsPublic] = useState(true)
  const [slug, setSlug] = useState("")
  const [slugTouched, setSlugTouched] = useState(false)

  // Step 3: members
  const [selectedUsers, setSelectedUsers] = useState([])
  const [memberSearch, setMemberSearch] = useState("")

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    if (!slugTouched) setSlug(slugify(name))
  }, [name, slugTouched])

  const handleAvatarChange = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setAvatarFile(file)
    setAvatarPreview(URL.createObjectURL(file))
  }

  const goToPrivacy = () => {
    if (!name.trim()) {
      setError("Channel name is required")
      return
    }
    setError("")
    setStep("privacy")
  }

  const finish = async () => {
    setLoading(true)
    setError("")

    try {
      const formData = new FormData()
      formData.append("type", "channel")
      formData.append("name", name.trim())
      if (description.trim()) formData.append("description", description.trim())
      if (avatarFile) formData.append("avatar", avatarFile)
      formData.append("is_public", isPublic)
      if (isPublic && slug.trim()) formData.append("invite_slug", slug.trim())

      const res = await api.post("/conversations/", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      })

      let addedCount = 0
      for (const userId of selectedUsers) {
        try {
          await api.post(`/conversations/${res.data.id}/add_member/`, { user_id: userId })
          addedCount += 1
        } catch (err) {
          console.error("Add member error:", err)
        }
      }

      // members_count on the create response predates the add_member
      // calls above, so it wouldn't reflect the members just added.
      const finalConversation = addedCount
        ? { ...res.data, members_count: (res.data.members_count || 1) + addedCount }
        : res.data

      upsertConversation(finalConversation)
      onCreated(finalConversation)
      onClose()
    } catch (err) {
      console.error("Create channel error", err)
      setError(
        err.response?.data?.name?.[0] ||
        err.response?.data?.invite_slug?.[0] ||
        "Failed to create channel. Please try again."
      )
    } finally {
      setLoading(false)
    }
  }

  const toggleUser = (id) => {
    setSelectedUsers((prev) =>
      prev.includes(id) ? prev.filter((u) => u !== id) : [...prev, id]
    )
  }

  const filteredUsers = (users || []).filter((u) =>
    `${u.full_name || ""} ${u.username || ""}`.toLowerCase().includes(memberSearch.toLowerCase())
  )

  const handleKeyDown = (e) => {
    if (e.key === "Escape") onClose()
  }

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [])

  return (
    <div className="create-group-modal-overlay" onClick={onClose}>
      <div className="create-group-modal" onClick={(e) => e.stopPropagation()}>
        {step === "info" && (
          <>
            <div className="modal-header">
              <h2>Create Channel</h2>
              <p>Broadcast messages to an audience</p>
              <button className="close-btn" onClick={onClose}>×</button>
            </div>

            <div className="modal-content">
              <div className="channel-avatar-picker">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={handleAvatarChange}
                />
                <button
                  type="button"
                  className="channel-avatar-btn"
                  onClick={() => fileInputRef.current?.click()}
                >
                  {avatarPreview ? (
                    <img src={avatarPreview} alt="Channel avatar" />
                  ) : (
                    <span className="channel-avatar-icon">📷</span>
                  )}
                </button>

                <div className="channel-name-field">
                  <input
                    type="text"
                    className="group-name-input"
                    placeholder="Channel name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    autoFocus
                    maxLength={50}
                  />
                </div>
              </div>

              <div className="input-group">
                <textarea
                  className="channel-description-input"
                  placeholder="Description (optional)"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  maxLength={255}
                  rows={3}
                />
              </div>

              {error && <div className="error-message">{error}</div>}
            </div>

            <div className="modal-footer">
              <button className="cancel-btn" onClick={onClose}>Cancel</button>
              <button className="create-btn" onClick={goToPrivacy} disabled={!name.trim()}>
                <span>Next</span>
              </button>
            </div>
          </>
        )}

        {step === "privacy" && (
          <>
            <div className="modal-header">
              <h2>Channel Type</h2>
              <button className="close-btn" onClick={onClose}>×</button>
            </div>

            <div className="modal-content">
              <div className="channel-privacy-options">
                <label className={`channel-privacy-option ${isPublic ? "selected" : ""}`}>
                  <input
                    type="radio"
                    checked={isPublic}
                    onChange={() => setIsPublic(true)}
                  />
                  <div>
                    <strong>Public Channel</strong>
                    <small>Anyone can find the channel in search and join.</small>
                  </div>
                </label>

                <label className={`channel-privacy-option ${!isPublic ? "selected" : ""}`}>
                  <input
                    type="radio"
                    checked={!isPublic}
                    onChange={() => setIsPublic(false)}
                  />
                  <div>
                    <strong>Private Channel</strong>
                    <small>Only people with an invite link can join.</small>
                  </div>
                </label>
              </div>

              {isPublic && (
                <div className="input-group">
                  <label>Link</label>
                  <div className="channel-link-input">
                    <span>t.me/</span>
                    <input
                      type="text"
                      value={slug}
                      onChange={(e) => {
                        setSlugTouched(true)
                        setSlug(slugify(e.target.value))
                      }}
                      maxLength={32}
                    />
                  </div>
                </div>
              )}

              {error && <div className="error-message">{error}</div>}
            </div>

            <div className="modal-footer">
              <button className="cancel-btn" onClick={() => setStep("members")} disabled={loading}>
                Skip
              </button>
              <button className="create-btn" onClick={() => setStep("members")} disabled={loading}>
                <span>Save</span>
              </button>
            </div>
          </>
        )}

        {step === "members" && (
          <>
            <div className="modal-header">
              <h2>Add Members</h2>
              <button className="close-btn" onClick={onClose}>×</button>
            </div>

            <div className="modal-content">
              <div className="search-members">
                <input
                  type="text"
                  placeholder="Search"
                  value={memberSearch}
                  onChange={(e) => setMemberSearch(e.target.value)}
                />
              </div>

              <div className="members-list">
                {filteredUsers.length === 0 ? (
                  <div className="no-results">No users found</div>
                ) : (
                  filteredUsers.map((user) => (
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
                        <div className="member-email">{user.email || "No email"}</div>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {error && <div className="error-message">{error}</div>}
            </div>

            <div className="modal-footer">
              <button className="cancel-btn" onClick={finish} disabled={loading}>
                Skip
              </button>
              <button className="create-btn" onClick={finish} disabled={loading}>
                {loading ? (
                  <>
                    <span className="btn-spinner"></span>
                    <span>Creating...</span>
                  </>
                ) : (
                  <span>Add</span>
                )}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default CreateChannelModal
