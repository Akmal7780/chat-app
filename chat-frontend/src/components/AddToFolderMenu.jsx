import { useChats } from "../context/ChatsContext"
import toast from "react-hot-toast"
import "./AddToFolderMenu.css"

// Shared "Add to folder" checklist, used from both ChannelInfoModal and
// UserInfoModal's more-menu. Reuses the same custom-folders backed by
// ChatFolderSerializer's conversation_ids (see FoldersView.jsx).
function AddToFolderMenu({ conversationId, className = "" }) {
  const { folders, toggleConversationInFolder } = useChats()

  if (folders.length === 0) {
    return (
      <div className={className}>
        <div className="add-to-folder-empty">No folders yet — create one in Settings → Folders</div>
      </div>
    )
  }

  const handleToggle = async (folder) => {
    try {
      await toggleConversationInFolder(folder.id, conversationId)
    } catch (err) {
      console.error("Add to folder error:", err)
      toast.error("Failed to update folder")
    }
  }

  return (
    <div className={className}>
      {folders.map((folder) => {
        const checked = folder.conversations.includes(conversationId)
        return (
          <button
            key={folder.id}
            className={`add-to-folder-item ${checked ? "checked" : ""}`}
            onClick={() => handleToggle(folder)}
          >
            <span className="add-to-folder-checkbox">{checked && "✓"}</span>
            📁 {folder.name}
          </button>
        )
      })}
    </div>
  )
}

export default AddToFolderMenu
