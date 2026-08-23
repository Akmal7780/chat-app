import toast from "react-hot-toast"
import api from "../api/axios"
import "./AutoDeletePicker.css"

const OPTIONS = [
  { label: "Off", value: null },
  { label: "1 day", value: 86400 },
  { label: "1 week", value: 604800 },
  { label: "1 month", value: 2592000 },
]

export function autoDeleteLabel(seconds) {
  const match = OPTIONS.find((o) => o.value === (seconds || null))
  return match ? match.label : "Off"
}

// Shared duration picker, used from both ChannelInfoModal and UserInfoModal's
// more-menu. Persists via the same PATCH /conversations/{id}/ endpoint used
// for editing name/description (see ConversationSerializer.auto_delete_seconds).
function AutoDeletePicker({ conversationId, currentSeconds, onUpdated, className = "" }) {
  const handleSelect = async (value) => {
    try {
      const res = await api.patch(`/conversations/${conversationId}/`, {
        auto_delete_seconds: value,
      })
      onUpdated?.(res.data)
      toast.success(value ? `Auto-delete set to ${autoDeleteLabel(value)}` : "Auto-delete turned off")
    } catch (err) {
      console.error("Auto-delete update error:", err)
      toast.error(err.response?.data?.error || "Failed to update auto-delete")
    }
  }

  return (
    <div className={className}>
      {OPTIONS.map((option) => (
        <button
          key={option.label}
          className={`auto-delete-item ${(currentSeconds || null) === option.value ? "checked" : ""}`}
          onClick={() => handleSelect(option.value)}
        >
          <span className="auto-delete-checkbox">{(currentSeconds || null) === option.value && "✓"}</span>
          {option.label}
        </button>
      ))}
    </div>
  )
}

export default AutoDeletePicker
