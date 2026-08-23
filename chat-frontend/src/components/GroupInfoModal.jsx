import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import toast from "react-hot-toast"
import api from "../api/axios"
import { getAvatarColor } from "../utils/avatarColor"
import "./GroupInfoModal.css"

function GroupInfoModal({
  conversation,
  currentUser,
  allUsers,
  onlineUsers,
  onClose,
  onMuteToggled,
  onLeft,
  onUpdated,
  onSelectMember,
}) {
  const [members, setMembers] = useState([])
  const [mode, setMode] = useState("view") // view | edit | addMembers
  const [showMore, setShowMore] = useState(false)

  // edit form
  const [name, setName] = useState(conversation.name || "")
  const [description, setDescription] = useState(conversation.description || "")
  const [avatarFile, setAvatarFile] = useState(null)
  const [avatarPreview, setAvatarPreview] = useState(null)
  const [saving, setSaving] = useState(false)
  const fileInputRef = useRef(null)

  // add members form
  const [memberSearch, setMemberSearch] = useState("")
  const [selectedNewIds, setSelectedNewIds] = useState([])
  const [addingMembers, setAddingMembers] = useState(false)

  const fetchMembers = () => {
    api.get(`/conversations/${conversation.id}/members/`)
      .then((res) => setMembers(res.data))
      .catch((err) => console.error("Group members error:", err))
  }

  useEffect(() => {
    fetchMembers()
  }, [conversation.id])

  const currentParticipant = members.find((m) => m.user === currentUser.id)
  const isAdmin = currentParticipant?.role === "admin"
  const memberCount = members.length || conversation.members_count

  const handleMute = async () => {
    try {
      const action = conversation.is_muted ? "unmute" : "mute"
      const res = await api.post(`/conversations/${conversation.id}/${action}/`)
      onMuteToggled?.(res.data)
    } catch (err) {
      console.error("Mute toggle error:", err)
    }
  }

  const handleLeave = async () => {
    try {
      await api.post(`/conversations/${conversation.id}/leave/`)
      onLeft?.()
      onClose()
    } catch (err) {
      console.error("Leave group error:", err)
      toast.error("Failed to leave group")
    }
  }

  const openEdit = () => {
    if (!isAdmin) {
      toast("Only admins can edit this group", { icon: "🔒" })
      return
    }
    setName(conversation.name || "")
    setDescription(conversation.description || "")
    setAvatarFile(null)
    setAvatarPreview(null)
    setMode("edit")
  }

  const handleAvatarChange = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setAvatarFile(file)
    setAvatarPreview(URL.createObjectURL(file))
  }

  const handleSaveEdit = async () => {
    if (!name.trim()) {
      toast.error("Group name is required")
      return
    }

    setSaving(true)
    try {
      const formData = new FormData()
      formData.append("name", name.trim())
      formData.append("description", description.trim())
      if (avatarFile) formData.append("avatar", avatarFile)

      const res = await api.patch(`/conversations/${conversation.id}/`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      })

      onUpdated?.(res.data)
      toast.success("Group updated")
      setMode("view")
    } catch (err) {
      console.error("Update group error:", err)
      toast.error(err.response?.data?.error || "Failed to update group")
    } finally {
      setSaving(false)
    }
  }

  const existingMemberIds = new Set(members.map((m) => m.user))
  const filteredNewUsers = (allUsers || [])
    .filter((u) => !existingMemberIds.has(u.id))
    .filter((u) => u.username?.toLowerCase().includes(memberSearch.toLowerCase()))

  const toggleNewUser = (id) => {
    setSelectedNewIds((prev) =>
      prev.includes(id) ? prev.filter((u) => u !== id) : [...prev, id]
    )
  }

  const handleAddMembers = async () => {
    setAddingMembers(true)
    try {
      for (const userId of selectedNewIds) {
        try {
          await api.post(`/conversations/${conversation.id}/add_member/`, { user_id: userId })
        } catch (err) {
          console.error("Add member error:", err)
        }
      }
      fetchMembers()
      onUpdated?.({ ...conversation, members_count: memberCount + selectedNewIds.length })
      setSelectedNewIds([])
      setMemberSearch("")
      setMode("view")
      toast.success("Members added")
    } finally {
      setAddingMembers(false)
    }
  }

  const handleRemoveMember = async (userId) => {
    try {
      await api.delete(`/conversations/${conversation.id}/remove-member/${userId}/`)
      fetchMembers()
      onUpdated?.({ ...conversation, members_count: Math.max(memberCount - 1, 0) })
    } catch (err) {
      console.error("Remove member error:", err)
      toast.error("Failed to remove member")
    }
  }

  return createPortal(
    <div className="group-info-overlay" onClick={onClose}>
      <div className="group-info-modal" onClick={(e) => e.stopPropagation()}>
        <button className="group-info-close" onClick={onClose}>×</button>

        {mode === "edit" ? (
          <>
            <h2 className="group-info-section-title">Edit Group</h2>

            <div className="group-info-edit-avatar-row">
              <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={handleAvatarChange} />
              <button type="button" className="group-info-avatar-btn" onClick={() => fileInputRef.current?.click()}>
                {avatarPreview ? (
                  <img src={avatarPreview} alt="Group avatar" />
                ) : conversation.avatar_url ? (
                  <img src={conversation.avatar_url} alt={conversation.name} />
                ) : (
                  <div className="group-info-avatar-placeholder" style={{ background: getAvatarColor(conversation.name) }}>
                    {conversation.name?.[0]?.toUpperCase()}
                  </div>
                )}
                <span className="group-info-avatar-edit-hint">📷</span>
              </button>
            </div>

            <div className="group-info-edit-field">
              <label>Group name</label>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} maxLength={50} />
            </div>

            <div className="group-info-edit-field">
              <label>Description</label>
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={255} rows={3} />
            </div>

            <div className="group-info-edit-actions">
              <button className="group-info-cancel-btn" onClick={() => setMode("view")} disabled={saving}>Cancel</button>
              <button className="group-info-save-btn" onClick={handleSaveEdit} disabled={saving}>
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </>
        ) : mode === "addMembers" ? (
          <>
            <h2 className="group-info-section-title">Add Members</h2>

            <div className="group-info-search">
              <input
                type="text"
                placeholder="Search"
                value={memberSearch}
                onChange={(e) => setMemberSearch(e.target.value)}
                autoFocus
              />
            </div>

            <div className="group-info-pick-list">
              {filteredNewUsers.length === 0 ? (
                <div className="group-info-empty">No users found</div>
              ) : (
                filteredNewUsers.map((user) => (
                  <div
                    key={user.id}
                    className={`group-info-pick-item ${selectedNewIds.includes(user.id) ? "selected" : ""}`}
                    onClick={() => toggleNewUser(user.id)}
                  >
                    <div className="group-info-pick-checkbox">{selectedNewIds.includes(user.id) && "✓"}</div>
                    <div className="group-info-member-avatar" style={{ background: getAvatarColor(user.username) }}>
                      {user.username?.[0]?.toUpperCase()}
                    </div>
                    <span>{user.username}</span>
                  </div>
                ))
              )}
            </div>

            <div className="group-info-edit-actions">
              <button className="group-info-cancel-btn" onClick={() => { setMode("view"); setSelectedNewIds([]); setMemberSearch("") }} disabled={addingMembers}>
                Cancel
              </button>
              <button className="group-info-save-btn" onClick={handleAddMembers} disabled={addingMembers || selectedNewIds.length === 0}>
                {addingMembers ? "Adding…" : `Add${selectedNewIds.length ? ` (${selectedNewIds.length})` : ""}`}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="group-info-avatar">
              {conversation.avatar_url ? (
                <img src={conversation.avatar_url} alt={conversation.name} />
              ) : (
                <div className="group-info-avatar-placeholder" style={{ background: getAvatarColor(conversation.name) }}>
                  {conversation.name?.[0]?.toUpperCase()}
                </div>
              )}
            </div>
            <h2>{conversation.name}</h2>
            <p className="group-info-sub">{memberCount} {memberCount === 1 ? "member" : "members"}</p>
            {conversation.description && <p className="group-info-description">{conversation.description}</p>}

            {isAdmin ? (
              <>
                <div className="group-info-actions">
                  <button className="group-info-action" onClick={handleMute}>
                    {conversation.is_muted ? "🔕" : "🔔"}
                    <span>{conversation.is_muted ? "Unmute" : "Mute"}</span>
                  </button>
                  <button className="group-info-action" onClick={() => setMode("addMembers")}>
                    ➕
                    <span>Add members</span>
                  </button>
                  <button className="group-info-action" onClick={openEdit}>
                    🎛️
                    <span>Manage</span>
                  </button>
                  <button className="group-info-action" onClick={() => setShowMore((v) => !v)}>
                    •••
                    <span>More</span>
                  </button>
                </div>

                {showMore && (
                  <div className="group-info-more-menu">
                    <button className="danger" onClick={handleLeave}>↩ Leave group</button>
                  </div>
                )}
              </>
            ) : (
              // Regular members: no edit/admin controls — only Mute, Add members, and Leave
              <div className="group-info-actions group-info-actions-limited">
                <button className="group-info-action" onClick={handleMute}>
                  {conversation.is_muted ? "🔕" : "🔔"}
                  <span>{conversation.is_muted ? "Unmute" : "Mute"}</span>
                </button>
                <button className="group-info-action" onClick={() => setMode("addMembers")}>
                  ➕
                  <span>Add members</span>
                </button>
                <button className="group-info-action" onClick={handleLeave}>
                  ↩
                  <span>Leave</span>
                </button>
              </div>
            )}

            <div className="group-info-members-section-label">{memberCount} {memberCount === 1 ? "member" : "members"}</div>

            <div className="group-info-members-list">
              {members.map((member) => {
                const isOnline = onlineUsers?.has(Number(member.user))
                const isSelf = member.user === currentUser.id

                return (
                  <div
                    key={member.id}
                    className="group-info-member-row"
                    onClick={() => !isSelf && onSelectMember?.(member)}
                  >
                    <div className="group-info-member-avatar-wrapper">
                      <div className="group-info-member-avatar" style={{ background: getAvatarColor(member.username) }}>
                        {member.username?.[0]?.toUpperCase()}
                      </div>
                      <span className={`group-info-member-status-dot ${isOnline ? "online" : "offline"}`} />
                    </div>
                    <div className="group-info-member-text">
                      <span className="group-info-member-name">
                        {member.username}{isSelf && " (you)"}
                      </span>
                      <span className="group-info-member-role">{member.role === "admin" ? "admin" : (isOnline ? "online" : "offline")}</span>
                    </div>
                    {isAdmin && !isSelf && (
                      <button
                        className="group-info-member-remove"
                        title="Remove"
                        onClick={(e) => { e.stopPropagation(); handleRemoveMember(member.user) }}
                      >
                        ✕
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  )
}

export default GroupInfoModal
