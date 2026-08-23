import { useEffect, useRef, useState } from "react"
import MessageReactions from "./MessageReactions"
import LinkPreviewCard from "./LinkPreviewCard"
import MessageContextMenu from "./MessageContextMenu"
import { extractFirstUrl } from "../utils/linkify"
import api from "../api/axios"
import "./MessageList.css" // Import the CSS file

function MessageList({ messages, currentUser, selectedUser, onMessageVisible,socket,onReply, onForwardRequest, loading }) {
  const messagesEndRef = useRef(null)
  const [previewImage, setPreviewImage] = useState(null)
  const [previewPDF, setPreviewPDF] = useState(null)
  const messageRefs = useRef({})
  const clickTimeout = useRef(null)
  const processedReads = useRef(new Set())
  const observerRef = useRef(null)
  const [contextMenu, setContextMenu] = useState(null)
  const [editingMessageId, setEditingMessageId] = useState(null)
  const [editingText, setEditingText] = useState("")
  const [translations, setTranslations] = useState({})
  const [translating, setTranslating] = useState(new Set())

  const getFileName = (url) => {
    if (!url) return ""
    return url.split("/").pop().split("?")[0]
  }

  const truncateFileName = (name, max = 20) => {
    if (!name) return ""
    if (name.length <= max) return name

    const ext = name.split(".").pop()
    return name.slice(0, max) + "..." + "." + ext
  }

  const formatFileSize = (size) => {
    if (!size) return ""

    const kb = size / 1024
    const mb = kb / 1024

    if (mb >= 1) return mb.toFixed(1) + " MB"
    return kb.toFixed(1) + " KB"
  }

  // Automatically scroll to bottom
  const scrollToBottom = () => {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
    }, 0)
  }
  
  useEffect(() => {
    scrollToBottom()
  }, [messages])

  useEffect(() => {
    if (!contextMenu) return

    const close = () => setContextMenu(null)
    window.addEventListener("click", close)
    window.addEventListener("scroll", close, true)

    return () => {
      window.removeEventListener("click", close)
      window.removeEventListener("scroll", close, true)
    }
  }, [contextMenu])

  const handleEditSave = (messageId) => {
    if (!editingText.trim()) return

    socket.current.send(JSON.stringify({
      type: "edit_message",
      message_id: messageId,
      text: editingText
    }))

    setEditingMessageId(null)
    setEditingText("")
  }

  const handleClick = (msg, e) => {
    const x = e.clientX
    const y = e.clientY

    clickTimeout.current = setTimeout(() => {
      handleMessageClick(msg, x, y)
    }, 250)
  }

  const handleDelete = async (msg) => {
    try {
      if (msg.attachments?.length > 0) {
        for (const file of msg.attachments) {
          if (file.id) {
            await api.delete(`/attachments/${file.id}/`)
          }
        }
      }

      socket.current.send(JSON.stringify({
        type: "delete_message",
        message_id: msg.id
      }))

    } catch (err) {
      console.error("❌ Delete error:", err)
    }
  }

  const scrollToMessage = (id) => {
    const el = messageRefs.current[id]
    if (!el) return

    el.scrollIntoView({ behavior: "smooth", block: "center" })

    el.style.background = "#fff3cd"
    setTimeout(() => {
      el.style.background = ""
    }, 1500)
  }

  useEffect(() => {
    return () => {
      if (clickTimeout.current) {
        clearTimeout(clickTimeout.current)
      }
    }
  }, [])

  // Tap message to open the Telegram-style context menu
  const handleMessageClick = (msg, x, y) => {
    if (msg.is_deleted) return

    setContextMenu(prev => (prev?.msgId === msg.id ? null : { msgId: msg.id, x, y }))
  }

  const handleContextMenu = (msg, e) => {
    e.preventDefault()
    if (msg.is_deleted) return

    if (clickTimeout.current) {
      clearTimeout(clickTimeout.current)
    }

    setContextMenu({ msgId: msg.id, x: e.clientX, y: e.clientY })
  }

  const handlePinToggle = (msg) => {
    socket.current?.send(JSON.stringify({
      type: msg.is_pinned ? "unpin_message" : "pin_message",
      message_id: msg.id
    }))
  }

  const handleReact = async (msg, emoji) => {
    try {
      const existing = (msg.reactions || []).find(r => r.user_id === currentUser?.id)

      if (existing && existing.emoji === emoji) {
        if (existing.id) {
          await api.delete(`/messages/${msg.id}/reactions/${existing.id}/`)
        }
      } else {
        await api.post(`/messages/${msg.id}/reactions/`, { emoji })
      }
    } catch (err) {
      console.error("❌ Reaction error:", err)
    }
  }

  const handleCopyText = (msg) => {
    navigator.clipboard.writeText(msg.content || "")
  }

  const handleTranslate = async (msg) => {
    setTranslating((prev) => new Set(prev).add(msg.id))
    try {
      const res = await api.post("/ai/translate/", {
        message: msg.content,
        target_language: "English",
      })
      setTranslations((prev) => ({ ...prev, [msg.id]: res.data.translated_text }))
    } catch (err) {
      console.error("❌ Translate error:", err)
    } finally {
      setTranslating((prev) => {
        const next = new Set(prev)
        next.delete(msg.id)
        return next
      })
    }
  }

  const handleDoubleClick = (msg) => {
    if (clickTimeout.current) {
      clearTimeout(clickTimeout.current)
    }

    if (msg.is_deleted) return

    if (isMyMessage(msg)) {
      handleEditStart(msg)
    } else {
      onReply && onReply(msg)
    }
  }

  const handleEditStart = (msg) => {
    if (!isMyMessage(msg)) return

    setEditingMessageId(msg.id)
    setEditingText(msg.content)
  }

  // Mark messages as read when visible
  useEffect(() => {
    if (!onMessageVisible || !currentUser) return

    if (observerRef.current) {
      observerRef.current.disconnect()
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const messageId = Number(entry.target.dataset.messageId)
            const message = messages.find(m => m.id === messageId)
            
            if (message && 
                !isMyMessage(message) && 
                message.status !== 'read' && 
                !processedReads.current.has(messageId)) {
              
              console.log("👁 Message visible, sending read:", messageId)
              processedReads.current.add(messageId)
              onMessageVisible(messageId)
            }
          }
        })
      },
      { threshold: 0.5 }
    )

    observerRef.current = observer

    Object.values(messageRefs.current).forEach((ref) => {
      if (ref) observer.observe(ref)
    })

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect()
      }
    }
  }, [messages, currentUser, onMessageVisible])

  // Cleanup
  useEffect(() => {
    return () => {
      processedReads.current.clear()
      if (observerRef.current) {
        observerRef.current.disconnect()
      }
    }
  }, [])

  // Format functions
  const formatTime = (dateString) => {
    try {
      const date = new Date(dateString)
      if (isNaN(date.getTime())) return ''
      return date.toLocaleTimeString([], { 
        hour: '2-digit', 
        minute: '2-digit' 
      })
    } catch {
      return ''
    }
  }

  const formatDate = (dateString) => {
    try {
      const date = new Date(dateString)
      if (isNaN(date.getTime())) return ''
      const today = new Date()
      const yesterday = new Date(today)
      yesterday.setDate(yesterday.getDate() - 1)

      if (date.toDateString() === today.toDateString()) {
        return 'Today'
      } else if (date.toDateString() === yesterday.toDateString()) {
        return 'Yesterday'
      } else {
        return date.toLocaleDateString()
      }
    } catch {
      return ''
    }
  }

  const getStatusIcon = (status) => {
    switch(status) {
      case 'sending': return '🕓'
      case 'sent': return '✓'
      case 'delivered': return '✓✓'
      case 'read': return '✓✓'
      case 'error': return '⚠ Not sent'
      default: return ''
    }
  }

  const getStatusColor = (status) => {
    switch(status) {
      case 'read': return 'var(--bubble-read-tick)'
      case 'sent':
      case 'delivered':
      case 'sending':
        return 'inherit'
      default: return 'inherit'
    }
  }

  const isMyMessage = (msg) => {
    return Number(msg.sender_id || msg.sender) === Number(currentUser?.id)
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

  return (
    <div className="message-list-container">
      {!loading && messages.length === 0 ? (
        <div className="message-list-empty-state">
          <div className="message-list-empty-icon">💬</div>
          <p className="message-list-empty-text">No messages yet. Start conversation!</p>
          <p className="message-list-empty-subtext">
            Say hello to {selectedUser?.username || 'your friend'}
          </p>
        </div>
      ) : (
        <>
          {messages.map((msg, index) => {
            const prevMsg = messages[index - 1]
            const showDate = index === 0 || 
              (prevMsg && new Date(msg.created_at).toDateString() !== new Date(prevMsg.created_at).toDateString())
            
            const myMessage = isMyMessage(msg)

            if (msg.message_type === "system") {
              return (
                <div key={`${msg.id}`} style={{ width: "100%" }}>
                  {showDate && (
                    <div className="message-list-date-divider">
                      <span className="message-list-date-text">
                        {formatDate(msg.created_at)}
                      </span>
                    </div>
                  )}
                  <div className="message-list-system-pill">
                    <span>{msg.content}</span>
                  </div>
                </div>
              )
            }

            return (
              <div key={`${msg.id}`} style={{ width: "100%" }}>
                {showDate && (
                  <div className="message-list-date-divider">
                    <span className="message-list-date-text">
                      {formatDate(msg.created_at)}
                    </span>
                  </div>
                )}

                <div
                  id={`message-${msg.id}`}
                  ref={el => messageRefs.current[msg.id] = el}
                  data-message-id={msg.id}
                  style={{
                    display: "flex",
                    justifyContent: myMessage ? "flex-end" : "flex-start",
                    marginBottom: "15px",
                    width: "100%",
                    position: "relative"
                  }}
                >
                  {!myMessage && (
                    <div
                      className="message-list-avatar"
                      style={{
                        background: getAvatarColor(msg.sender_username || selectedUser?.username || "")
                      }}
                    >
                      {(msg.sender_username || msg.sender || "?")[0].toUpperCase()}
                    </div>
                  )}
                  
                  <div style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: myMessage ? "flex-end" : "flex-start",
                    maxWidth: "70%",
                    marginLeft: !myMessage ? "8px" : "0",
                    marginRight: myMessage ? "8px" : "0"
                  }}>
                    {/* Message bubble with click handler */}
                    <div
                      className={`message-list-bubble ${myMessage ? 'my-message' : 'other-message'} ${msg.is_pinned ? 'pinned' : ''}`}
                      onClick={(e) => handleClick(msg, e)}
                      onDoubleClick={() => handleDoubleClick(msg)}
                      onContextMenu={(e) => handleContextMenu(msg, e)}
                    >
                      <div className="message-list-content">
                        {/* FORWARDED LABEL */}
                        {msg.forwarded_from && (
                          <div className="message-list-forwarded-label">
                            ➡️ Forwarded from {msg.forwarded_from.sender_username}
                          </div>
                        )}

                        {/* REPLY PREVIEW */}
                        {msg.reply_to && msg.reply_to.content && msg.reply_to.id !== msg.id && (
                          <div
                            onClick={(e) => {
                              e.stopPropagation()   
                              scrollToMessage(msg.reply_to.id)
                            }}
                            className="message-list-reply-preview"
                          >
                            <div className="message-list-reply-sender">
                              {msg.reply_to.sender || ""}
                            </div>
                            <div className="message-list-reply-content">
                              {msg.reply_to.content}
                            </div>
                          </div>
                        )}
                        
                        {msg.message_type === "call" ? (
                          <div className="message-list-call-row">
                            <span className="message-list-call-icon">
                              {msg.call_is_video ? "🎥" : "📞"}
                            </span>
                            <div className="message-list-call-text">
                              <span className="message-list-call-label">
                                {msg.call_status === "completed"
                                  ? (msg.call_is_video ? "Video call" : "Voice call")
                                  : msg.call_status === "declined"
                                  ? (msg.call_is_video ? "Declined video call" : "Declined call")
                                  : myMessage
                                  ? (msg.call_is_video ? "Canceled video call" : "Canceled call")
                                  : (msg.call_is_video ? "Missed video call" : "Missed call")}
                              </span>
                              <span className="message-list-call-meta">
                                {myMessage ? "↙" : "↗"}
                                {msg.call_status === "completed" && msg.call_duration_seconds != null && (
                                  <> {Math.floor(msg.call_duration_seconds / 60)}:
                                    {String(msg.call_duration_seconds % 60).padStart(2, "0")}
                                  </>
                                )}
                              </span>
                            </div>
                          </div>
                        ) : editingMessageId === msg.id ? (
                          <input
                            className="message-list-edit-input"
                            value={editingText}
                            onChange={(e) => setEditingText(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && !e.shiftKey) {
                                handleEditSave(msg.id)
                              }
                              if (e.key === "Escape") setEditingMessageId(null)
                            }}
                            autoFocus
                          />
                        ) : (
                          <div className="message-list-text">
                            {/* TEXT */}
                            <div>
                              {msg.is_deleted ? (
                                  <span className="message-list-deleted-text">
                                    {msg.content || "🚫 Message deleted"}
                                  </span>
                                ) : (
                                <>
                                  <span>{msg.content}</span>

                                  {msg.is_edited && (
                                    <span
                                      className={`message-list-edited-badge ${myMessage ? 'my-message' : 'other-message'}`}
                                    >
                                      edited
                                    </span>
                                  )}

                                  {extractFirstUrl(msg.content) && (
                                    <LinkPreviewCard url={extractFirstUrl(msg.content)} />
                                  )}

                                  {translating.has(msg.id) && (
                                    <div className="message-list-translation message-list-translation-loading">
                                      🌐 Translating…
                                    </div>
                                  )}

                                  {translations[msg.id] && (
                                    <div className="message-list-translation">
                                      <span className="message-list-translation-label">🌐 Translated</span>
                                      <span>{translations[msg.id]}</span>
                                      <button
                                        className="message-list-translation-close"
                                        onClick={() =>
                                          setTranslations((prev) => {
                                            const next = { ...prev }
                                            delete next[msg.id]
                                            return next
                                          })
                                        }
                                      >
                                        ×
                                      </button>
                                    </div>
                                  )}
                                </>
                              )}
                            </div>
                          </div>
                        )}
                        
                        {msg.attachments?.map((file) => {
                          const fileName = truncateFileName(file.original_name || getFileName(file.file_url))
                           // 🔥 INFECTED FILE
                          if (file.scan_status === "infected" || !file.file_url) {
                        return (
                          <div key={file.id || Math.random()} className="message-list-deleted-text">
                            🚨 File removed (virus detected)
                          </div>
                        )
                      }

                          return (
                            <div key={file.id || file.file_url} className="message-list-attachment">
                              {/* IMAGE */}
                              {file.file_type === "image" && (
                                <>
                                  <img
                                    src={file.file_url}
                                    alt={fileName}
                                    className="message-list-attachment-image"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      setPreviewImage(file.file_url)
                                    }}
                                  />
                                  <div className="message-list-attachment-info">
                                    🖼 {fileName}
                                  </div>
                                </>
                              )}

                              {/* VOICE */}
                              {file.file_type === "voice" && (
                                <>
                                  <audio
                                    controls
                                    className="message-list-attachment-voice"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <source src={file.file_url} />
                                  </audio>
                                </>
                              )}

                              {/* VIDEO */}
                              {file.file_type === "video" && (
                                <>
                                  <video
                                    width="220"
                                    controls
                                    onClick={(e) => e.stopPropagation()}
                                    className="message-list-attachment-video"
                                  >
                                    <source src={file.file_url} />
                                  </video>
                                  <div className="message-list-attachment-info">
                                    🎥 {fileName}
                                  </div>
                                  <div className="message-list-attachment-size">
                                    {formatFileSize(file.file_size)}
                                  </div>
                                </>
                              )}

                              {/* PDF */}
                              {file.file_url.toLowerCase().includes(".pdf") && (
                                <>
                                  <div
                                    className="message-list-pdf-link"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      setPreviewPDF(file.file_url)
                                    }}
                                  >
                                    📄 {fileName}
                                  </div>
                                  <div className="message-list-attachment-size">
                                    {formatFileSize(file.file_size)}
                                  </div>
                                </>
                              )}

                              {/* OTHER FILES */}
                              {file.file_type === "file" &&
                                !file.file_url.toLowerCase().includes(".pdf") && (
                                  <>
                                    <a
                                      href={file.file_url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="message-list-file-link"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      📎 Download
                                    </a>
                                    <div className="message-list-attachment-info">
                                      📎 {fileName}
                                    </div>
                                    <div className="message-list-attachment-size">
                                      {formatFileSize(file.file_size)}
                                    </div>
                                  </>
                                )}

                              {msg.status === "sending" && (
                                <div className="message-list-upload-progress">
                                  <div className="message-list-progress-bar">
                                    <div
                                      className="message-list-progress-fill"
                                      style={{ width: `${msg.progress || 0}%` }}
                                    />
                                  </div>
                                  <div className="message-list-upload-text">
                                    ⏳ Uploading... {msg.progress || 0}%
                                  </div>
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>

                      {/* Vaqt va status — inside the bubble, Telegram-style */}
                      <div className="message-list-footer">
                        <span>{formatTime(msg.created_at)}</span>

                        {myMessage && msg.status && (
                          <span className={`message-list-status-${msg.status}`}>
                            {getStatusIcon(msg.status)}
                          </span>
                        )}
                      </div>

                      {/* Quick reaction indicator on hover */}
                      {!myMessage && (
                        <div className="message-list-hint-indicator">
                          👆 Click to react
                        </div>
                      )}
                    </div>

                    {/* Reactions */}
                    {!msg.is_deleted && (
                      <MessageReactions
                        message={msg}
                        currentUser={currentUser}
                      />
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </>
      )}

      {contextMenu && (() => {
        const targetMessage = messages.find(m => m.id === contextMenu.msgId)
        if (!targetMessage) return null

        return (
          <MessageContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            message={targetMessage}
            isMyMessage={isMyMessage(targetMessage)}
            onClose={() => setContextMenu(null)}
            onReply={onReply}
            onCopy={handleCopyText}
            onDelete={handleDelete}
            onPinToggle={handlePinToggle}
            onForward={onForwardRequest}
            onReact={handleReact}
            onTranslate={handleTranslate}
          />
        )
      })()}

      {previewImage && (
        <div className="message-list-image-preview" onClick={() => setPreviewImage(null)}>
          <img
            src={previewImage}
            onClick={(e) => e.stopPropagation()}
            className="message-list-preview-image"
          />
        </div>
      )}

      {previewPDF && (
        <div className="message-list-pdf-preview" onClick={() => setPreviewPDF(null)}>
          <iframe 
            src={previewPDF} 
            onClick={(e) => e.stopPropagation()} 
            className="message-list-preview-iframe"
            title="PDF Preview"
          />
        </div>
      )}
      
      <div ref={messagesEndRef} />
    </div>
  )
}

export default MessageList