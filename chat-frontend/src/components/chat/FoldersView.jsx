import { useState } from "react"
import toast from "react-hot-toast"
import { useChats } from "../../context/ChatsContext"

function conversationLabel(c) {
  if (c.type === "group") return c.name
  return c.other_participant ? (c.other_participant.full_name || "Unknown") : "Saved Messages"
}

function CreateFolderForm({ conversations, onCancel, onCreate }) {
  const [name, setName] = useState("")
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [saving, setSaving] = useState(false)

  const toggleConversation = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const handleSave = async () => {
    const trimmed = name.trim()
    if (!trimmed) {
      toast.error("Folder name is required")
      return
    }
    if (selectedIds.size === 0) {
      toast.error("Select at least one chat")
      return
    }

    setSaving(true)
    try {
      await onCreate(trimmed, [...selectedIds])
      toast.success(`"${trimmed}" folder created`)
    } catch (err) {
      console.error("Create folder error:", err)
      toast.error("Failed to create folder")
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div className="settings-list">
        <div className="settings-list-section-label">Folder name</div>
        <div className="folder-name-input-row">
          <input
            type="text"
            placeholder="e.g. Work"
            maxLength={50}
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </div>
      </div>

      <div className="settings-list">
        <div className="settings-list-section-label">Include chats</div>
        {conversations.length === 0 && (
          <div className="folders-list-item settings-list-item">No chats yet</div>
        )}
        {conversations.map((c) => (
          <label key={c.id} className="settings-list-item folder-chat-checkbox-row">
            <input
              type="checkbox"
              checked={selectedIds.has(c.id)}
              onChange={() => toggleConversation(c.id)}
            />
            <span>{conversationLabel(c)}</span>
          </label>
        ))}
      </div>

      <div className="folder-form-actions">
        <button className="folder-form-cancel" onClick={onCancel} disabled={saving}>Cancel</button>
        <button className="folder-form-save" onClick={handleSave} disabled={saving}>
          {saving ? "Creating…" : "Create"}
        </button>
      </div>
    </>
  )
}

function FoldersView({ onBack, onClose, standalone }) {
  const { conversations, folders, createFolder, deleteFolder } = useChats()
  const [creating, setCreating] = useState(false)

  const privateCount = conversations.filter((c) => c.type === "private").length
  const groupsCount = conversations.filter((c) => c.type === "group").length
  const unreadCount = conversations.filter((c) => (c.unread_count || 0) > 0).length

  const DEFAULT_FOLDERS = [
    { icon: "👤", label: "Private", count: privateCount },
    { icon: "👥", label: "Groups", count: groupsCount },
    { icon: "💬", label: "Unread", count: unreadCount },
  ]

  const handleDelete = async (folder) => {
    try {
      await deleteFolder(folder.id)
      toast.success(`"${folder.name}" folder deleted`)
    } catch (err) {
      console.error("Delete folder error:", err)
      toast.error("Failed to delete folder")
    }
  }

  return (
    <>
      <div className="settings-modal-topbar">
        {standalone && !creating ? (
          <>
            <h2>Folders</h2>
            <div className="settings-modal-topbar-actions">
              <button className="settings-close-btn" onClick={onClose}>×</button>
            </div>
          </>
        ) : (
          <>
            <button
              className="settings-back-btn"
              onClick={() => (creating ? setCreating(false) : onBack())}
            >
              ←
            </button>
            <h2>{creating ? "New Folder" : "Folders"}</h2>
            <div className="settings-modal-topbar-actions" />
          </>
        )}
      </div>

      {creating ? (
        <CreateFolderForm
          conversations={conversations}
          onCancel={() => setCreating(false)}
          onCreate={async (name, ids) => {
            await createFolder(name, ids)
            setCreating(false)
          }}
        />
      ) : (
        <>
          <div className="folders-intro">
            <span className="folders-intro-icon">🗂️</span>
            <p>Create folders for different groups of chats and quickly switch between them.</p>
          </div>

          <div className="settings-list">
            <div className="settings-list-section-label">My folders</div>

            {DEFAULT_FOLDERS.map(({ icon, label, count }) => (
              <div key={label} className="settings-list-item folders-list-item">
                <span className="settings-list-icon">{icon}</span>
                <span className="settings-list-item-text">
                  <span>{label}</span>
                  <small>{count} {count === 1 ? "chat" : "chats"}</small>
                </span>
              </div>
            ))}

            {folders.map((folder) => (
              <div key={folder.id} className="settings-list-item folders-list-item">
                <span className="settings-list-icon">📁</span>
                <span className="settings-list-item-text">
                  <span>{folder.name}</span>
                  <small>{folder.conversations.length} {folder.conversations.length === 1 ? "chat" : "chats"}</small>
                </span>
                <button
                  className="folders-delete-btn"
                  onClick={() => handleDelete(folder)}
                  title="Delete folder"
                >
                  🗑
                </button>
              </div>
            ))}

            <button
              className="settings-list-item folders-create-btn"
              onClick={() => setCreating(true)}
            >
              <span className="settings-list-icon">➕</span>
              <span>Create new folder</span>
            </button>
          </div>
        </>
      )}
    </>
  )
}

export default FoldersView
