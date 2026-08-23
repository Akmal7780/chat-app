import "./MessageContextMenu.css"
import { getLanguagePrefs } from "../utils/languagePrefs"

const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🔥"]
const MENU_WIDTH = 200

function MessageContextMenu({
  x,
  y,
  message,
  isMyMessage,
  onClose,
  onReply,
  onCopy,
  onDelete,
  onPinToggle,
  onForward,
  onReact,
  onTranslate,
}) {
  const canTranslate = getLanguagePrefs().showTranslateButton &&
    message.message_type === "text" && message.content?.trim() && !message.is_deleted
  const left = Math.min(x, window.innerWidth - MENU_WIDTH - 12)
  const top = Math.min(y, window.innerHeight - 320)

  return (
    <div
      className="message-context-menu-wrapper"
      style={{ left, top }}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="message-context-quick-reactions">
        {QUICK_REACTIONS.map((emoji) => (
          <button
            key={emoji}
            className="message-context-emoji-btn"
            onClick={() => {
              onReact(message, emoji)
              onClose()
            }}
          >
            {emoji}
          </button>
        ))}
      </div>

      <div className="message-context-menu">
        <button
          onClick={() => {
            onReply(message)
            onClose()
          }}
        >
          <span className="message-context-icon">↩️</span> Reply
        </button>

        <button
          onClick={() => {
            onPinToggle(message)
            onClose()
          }}
        >
          <span className="message-context-icon">📌</span>
          {message.is_pinned ? "Unpin" : "Pin"}
        </button>

        <button
          onClick={() => {
            onCopy(message)
            onClose()
          }}
        >
          <span className="message-context-icon">📋</span> Copy Text
        </button>

        <button
          onClick={() => {
            onForward(message)
            onClose()
          }}
        >
          <span className="message-context-icon">➡️</span> Forward
        </button>

        {canTranslate && (
          <button
            onClick={() => {
              onTranslate(message)
              onClose()
            }}
          >
            <span className="message-context-icon">🌐</span> Translate
          </button>
        )}

        {isMyMessage && (
          <button
            className="danger"
            onClick={() => {
              onDelete(message)
              onClose()
            }}
          >
            <span className="message-context-icon">🗑</span> Delete
          </button>
        )}
      </div>
    </div>
  )
}

export default MessageContextMenu
