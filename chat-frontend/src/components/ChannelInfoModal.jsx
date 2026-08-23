import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import toast from "react-hot-toast"
import api from "../api/axios"
import { getAvatarColor } from "../utils/avatarColor"
import { slugify } from "../utils/slugify"
import AddToFolderMenu from "./AddToFolderMenu"
import AutoDeletePicker, { autoDeleteLabel } from "./AutoDeletePicker"
import "./ChannelInfoModal.css"

function ChannelInfoModal({ conversation, currentUser, allUsers, onClose, onMuteToggled, onLeft, onUpdated }) {
  const [members, setMembers] = useState([])
  const [showMore, setShowMore] = useState(false)
  const [showFolderPicker, setShowFolderPicker] = useState(false)
  const [showAutoDelete, setShowAutoDelete] = useState(false)
  const [mode, setMode] = useState("view") // view | edit | addMembers

  // edit form
  const [name, setName] = useState(conversation.name || "")
  const [description, setDescription] = useState(conversation.description || "")
  const [isPublic, setIsPublic] = useState(conversation.is_public ?? true)
  const [slug, setSlug] = useState(conversation.invite_slug || "")
  const [slugTouched, setSlugTouched] = useState(false)
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
      .catch((err) => console.error("Channel members error:", err))
  }

  useEffect(() => {
    fetchMembers()
  }, [conversation.id])

  useEffect(() => {
    if (!slugTouched) setSlug(slugify(name))
  }, [name, slugTouched])

  const adminCount = members.filter((m) => m.role === "admin").length
  const subscriberCount = members.length || conversation.members_count
  const isAdmin = members.find((m) => m.user === currentUser.id)?.role === "admin"

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
      console.error("Leave channel error:", err)
      toast.error("Failed to leave channel")
    }
  }

  const openEdit = () => {
    if (!isAdmin) {
      toast("Only admins can manage this channel", { icon: "🔒" })
      return
    }
    setName(conversation.name || "")
    setDescription(conversation.description || "")
    setIsPublic(conversation.is_public ?? true)
    setSlug(conversation.invite_slug || "")
    setSlugTouched(false)
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
      toast.error("Channel name is required")
      return
    }

    setSaving(true)
    try {
      const formData = new FormData()
      formData.append("name", name.trim())
      formData.append("description", description.trim())
      formData.append("is_public", isPublic)
      if (isPublic && slug.trim()) formData.append("invite_slug", slug.trim())
      if (avatarFile) formData.append("avatar", avatarFile)

      const res = await api.patch(`/conversations/${conversation.id}/`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      })

      onUpdated?.(res.data)
      toast.success("Channel updated")
      setMode("view")
    } catch (err) {
      console.error("Update channel error:", err)
      toast.error(
        err.response?.data?.name?.[0] ||
        err.response?.data?.invite_slug?.[0] ||
        err.response?.data?.error ||
        "Failed to update channel"
      )
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
      onUpdated?.({ ...conversation, members_count: subscriberCount + selectedNewIds.length })
      setSelectedNewIds([])
      setMemberSearch("")
      setMode("view")
      toast.success("Members added")
    } finally {
      setAddingMembers(false)
    }
  }

  const inviteLink = conversation.invite_slug ? `t.me/${conversation.invite_slug}` : null

  const copyLink = () => {
    if (!inviteLink) return
    navigator.clipboard.writeText(`https://${inviteLink}`)
    toast.success("Link copied")
  }

  return createPortal(
    <div className="channel-info-overlay" onClick={onClose}>
      <div className="channel-info-modal" onClick={(e) => e.stopPropagation()}>
        <button className="channel-info-close" onClick={onClose}>×</button>

        {mode === "edit" ? (
          <>
            <h2 className="channel-info-section-title">Edit Channel</h2>

            <div className="channel-info-edit-avatar-row">
              <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={handleAvatarChange} />
              <button type="button" className="channel-info-avatar-btn" onClick={() => fileInputRef.current?.click()}>
                {avatarPreview ? (
                  <img src={avatarPreview} alt="Channel avatar" />
                ) : conversation.avatar_url ? (
                  <img src={conversation.avatar_url} alt={conversation.name} />
                ) : (
                  <div className="channel-info-avatar-placeholder" style={{ background: getAvatarColor(conversation.name) }}>
                    {conversation.name?.[0]?.toUpperCase()}
                  </div>
                )}
                <span className="channel-info-avatar-edit-hint">📷</span>
              </button>
            </div>

            <div className="channel-info-edit-field">
              <label>Channel name</label>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} maxLength={50} />
            </div>

            <div className="channel-info-edit-field">
              <label>Description</label>
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={255} rows={3} />
            </div>

            <div className="channel-privacy-options">
              <label className={`channel-privacy-option ${isPublic ? "selected" : ""}`}>
                <input type="radio" checked={isPublic} onChange={() => setIsPublic(true)} />
                <div>
                  <strong>Public Channel</strong>
                  <small>Anyone can find the channel in search and join.</small>
                </div>
              </label>
              <label className={`channel-privacy-option ${!isPublic ? "selected" : ""}`}>
                <input type="radio" checked={!isPublic} onChange={() => setIsPublic(false)} />
                <div>
                  <strong>Private Channel</strong>
                  <small>Only people with an invite link can join.</small>
                </div>
              </label>
            </div>

            {isPublic && (
              <div className="channel-info-edit-field">
                <label>Link</label>
                <div className="channel-link-input">
                  <span>t.me/</span>
                  <input
                    type="text"
                    value={slug}
                    onChange={(e) => { setSlugTouched(true); setSlug(slugify(e.target.value)) }}
                    maxLength={32}
                  />
                </div>
              </div>
            )}

            <div className="channel-info-edit-actions">
              <button className="channel-info-cancel-btn" onClick={() => setMode("view")} disabled={saving}>Cancel</button>
              <button className="channel-info-save-btn" onClick={handleSaveEdit} disabled={saving}>
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </>
        ) : mode === "addMembers" ? (
          <>
            <h2 className="channel-info-section-title">Add Subscribers</h2>

            <div className="channel-info-edit-field">
              <input
                type="text"
                placeholder="Search"
                value={memberSearch}
                onChange={(e) => setMemberSearch(e.target.value)}
                autoFocus
              />
            </div>

            <div className="channel-info-pick-list">
              {filteredNewUsers.length === 0 ? (
                <div className="channel-info-empty">No users found</div>
              ) : (
                filteredNewUsers.map((user) => (
                  <div
                    key={user.id}
                    className={`channel-info-pick-item ${selectedNewIds.includes(user.id) ? "selected" : ""}`}
                    onClick={() => toggleNewUser(user.id)}
                  >
                    <div className="channel-info-pick-checkbox">{selectedNewIds.includes(user.id) && "✓"}</div>
                    <div className="channel-info-pick-avatar" style={{ background: getAvatarColor(user.username) }}>
                      {user.username?.[0]?.toUpperCase()}
                    </div>
                    <span>{user.username}</span>
                  </div>
                ))
              )}
            </div>

            <div className="channel-info-edit-actions">
              <button className="channel-info-cancel-btn" onClick={() => { setMode("view"); setSelectedNewIds([]); setMemberSearch("") }} disabled={addingMembers}>
                Cancel
              </button>
              <button className="channel-info-save-btn" onClick={handleAddMembers} disabled={addingMembers || selectedNewIds.length === 0}>
                {addingMembers ? "Adding…" : `Add${selectedNewIds.length ? ` (${selectedNewIds.length})` : ""}`}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="channel-info-avatar">
              {conversation.avatar_url ? (
                <img src={conversation.avatar_url} alt={conversation.name} />
              ) : (
                <div
                  className="channel-info-avatar-placeholder"
                  style={{ background: getAvatarColor(conversation.name) }}
                >
                  {conversation.name?.[0]?.toUpperCase()}
                </div>
              )}
            </div>
            <h2>{conversation.name}</h2>
            <p className="channel-info-sub">
              {subscriberCount} {subscriberCount === 1 ? "subscriber" : "subscribers"}
            </p>
            {conversation.description && <p className="channel-info-description">{conversation.description}</p>}

            {isAdmin ? (
              <>
                <div className="channel-info-actions">
                  <button className="channel-info-action" onClick={handleMute}>
                    {conversation.is_muted ? "🔕" : "🔔"}
                    <span>{conversation.is_muted ? "Unmute" : "Mute"}</span>
                  </button>
                  <button className="channel-info-action" onClick={openEdit}>
                    🎛️
                    <span>Manage</span>
                  </button>
                  <button className="channel-info-action" onClick={() => toast("Live stream — coming soon", { icon: "🚧" })}>
                    📡
                    <span>Live stream</span>
                  </button>
                  <button className="channel-info-action" onClick={() => setShowMore((v) => !v)}>
                    •••
                    <span>More</span>
                  </button>
                </div>

                {showMore && (
                  <div className="channel-info-more-menu">
                    <button onClick={() => setShowAutoDelete((v) => !v)}>⏱️ Auto-Delete: {autoDeleteLabel(conversation.auto_delete_seconds)}</button>
                    {showAutoDelete && (
                      <AutoDeletePicker
                        conversationId={conversation.id}
                        currentSeconds={conversation.auto_delete_seconds}
                        onUpdated={(updated) => onUpdated?.(updated)}
                        className="channel-info-folder-picker"
                      />
                    )}
                    <button onClick={() => setMode("addMembers")}>➕ Add users</button>
                    <button onClick={() => toast("Send a Gift — coming soon", { icon: "🚧" })}>🎁 Send a Gift</button>
                    <button onClick={() => toast("Boosts — coming soon", { icon: "🚧" })}>⚡ Boosts</button>
                    <button onClick={() => toast("Story Archive — coming soon", { icon: "🚧" })}>🗄️ Story Archive</button>
                    <button onClick={openEdit}>🎛️ Manage Channel</button>
                    <button onClick={() => toast("Set as Personal Channel — coming soon", { icon: "🚧" })}>👤 Set as Personal Channel</button>
                    <button onClick={() => setShowFolderPicker((v) => !v)}>📁 Add to folder</button>
                    {showFolderPicker && (
                      <AddToFolderMenu conversationId={conversation.id} className="channel-info-folder-picker" />
                    )}
                    <button className="danger" onClick={handleLeave}>↩ Leave channel</button>
                  </div>
                )}

                {inviteLink ? (
                  <div className="channel-info-link-section">
                    <div className="channel-info-link-row" onClick={copyLink} title="Copy link">
                      <span className="channel-info-link">{inviteLink}</span>
                      <span className="channel-info-link-hint">Link</span>
                    </div>
                    <button
                      className="channel-info-view-btn"
                      onClick={copyLink}
                    >
                      VIEW CHANNEL
                    </button>
                  </div>
                ) : (
                  <div className="channel-info-link-section">
                    <span className="channel-info-link-hint">Private channel — invite link not set</span>
                  </div>
                )}

                <div className="channel-info-stats">
                  <div className="channel-info-stat-row">
                    <span>👥 {subscriberCount} {subscriberCount === 1 ? "subscriber" : "subscribers"}</span>
                  </div>
                  <div className="channel-info-stat-row">
                    <span>🛡️ {adminCount} {adminCount === 1 ? "administrator" : "administrators"}</span>
                  </div>
                </div>

                <button className="channel-info-leave-btn" onClick={handleLeave}>
                  ↩ Leave channel
                </button>
              </>
            ) : (
              <>
                {/* Non-admin members only get the name/subscriber-count already shown above, Mute, and Leave — no edit/manage controls */}
                <div className="channel-info-actions channel-info-actions-limited">
                  <button className="channel-info-action" onClick={handleMute}>
                    {conversation.is_muted ? "🔕" : "🔔"}
                    <span>{conversation.is_muted ? "Unmute" : "Mute"}</span>
                  </button>
                  <button className="channel-info-action" onClick={handleLeave}>
                    ↩
                    <span>Leave</span>
                  </button>
                </div>

                <div className="channel-info-stats">
                  <div className="channel-info-stat-row">
                    <span>👥 {subscriberCount} {subscriberCount === 1 ? "subscriber" : "subscribers"}</span>
                  </div>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>,
    document.body
  )
}

export default ChannelInfoModal
