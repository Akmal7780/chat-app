import { useEffect, useRef, useState } from "react"
import MessageReactions from "./MessageReactions"
import api from "../api/axios"

function MessageList({ messages, currentUser, selectedUser, onMessageVisible,socket,onReply }) {
  const messagesEndRef = useRef(null)
  const messageRefs = useRef({})
  const clickTimeout = useRef(null)
  const processedReads = useRef(new Set())
  const observerRef = useRef(null)
  const [activeMessage, setActiveMessage] = useState(null)
  const [editingMessageId, setEditingMessageId] = useState(null)
  const [editingText, setEditingText] = useState("")


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
  const close = (e) => {
    if (!e.target.closest(".message-bubble")) {
      setActiveMessage(null)
    }
  }

  window.addEventListener("click", close)
  return () => window.removeEventListener("click", close)
}, [])

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


  const handleClick = (msg) => {
  clickTimeout.current = setTimeout(() => {
    handleMessageClick(msg)
  }, 250)
}

  const handleDelete = (messageId) => {
  socket.current.send(JSON.stringify({
    type: "delete_message",
    message_id: messageId
  }))
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

  // Tap message to react
  const handleMessageClick = (msg) => {
  if (msg.is_deleted) return

  setActiveMessage(prev => prev === msg.id ? null : msg.id)
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
  if (!isMyMessage(msg)) return // Only own messages

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
                message.status !== 'delivered' &&
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
      case 'sending': return '⏳'
      case 'sent': return '✓'
      case 'read': return '✓✓'
      default: return ''
    }
  }

  const getStatusColor = (status) => {
    switch(status) {
      case 'read': return '#4fc3f7'
      case 'sent': return '#a0a0a0'
      case 'sending': return '#a0a0a0'
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
    <div style={styles.container}>
      {messages.length === 0 ? (
        <div style={styles.emptyState}>
          <div style={styles.emptyIcon}>💬</div>
          <p style={styles.emptyText}>No messages yet. Start conversation!</p>
          <p style={styles.emptySubtext}>
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

            return (
              <div key={msg.id} style={{ width: "100%" }}>
                {showDate && (
                  <div style={styles.dateDivider}>
                    <span style={styles.dateText}>
                      {formatDate(msg.created_at)}
                    </span>
                  </div>
                )}
                
                <div
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
                      style={{
                        ...styles.avatar,
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
                    className="message-bubble"
                      style={{
                      ...styles.messageBubble,
                      background: myMessage
                        ? "linear-gradient(135deg, #d9fdd3, #c7f5c1)"
                        : "#ffffff",
                      color: "black",
                      borderTopRightRadius: myMessage ? "4px" : "15px",
                      borderTopLeftRadius: !myMessage ? "4px" : "15px",
                      cursor: !myMessage ? "pointer" : "default",
                      position: "relative"
                    }}
                      onClick={() => handleClick(msg)}
                      onDoubleClick={() => handleDoubleClick(msg)}
                    >
                     <div style={styles.messageContent}>
                      {/* 🔥 REPLY PREVIEW */}
                      {msg.reply_to && msg.reply_to.content && msg.reply_to.id !== msg.id && (
                        <div
                          onClick={(e) => {
                            e.stopPropagation()   
                            scrollToMessage(msg.reply_to.id)
                          }}
                          style={{
                            borderLeft: "3px solid #00a884",
                            paddingLeft: "8px",
                            marginBottom: "6px",
                            background: "#f0f2f5",
                            borderRadius: "6px",
                            fontSize: "13px",
                            cursor: "pointer"
                          }}
                        >
                          <div style={{ fontWeight: "bold", color: "#00a884" }}>
                            {msg.reply_to.sender || ""}
                          </div>
                          <div style={{ color: "#555" }}>
                            {msg.reply_to.content}
                          </div>
                        </div>
                      )}
                        {editingMessageId === msg.id ? (
                          <input
                            value={editingText}
                            onChange={(e) => setEditingText(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && !e.shiftKey) {
                              handleEditSave(msg.id)
                            }
                              if (e.key === "Escape") setEditingMessageId(null)
                            }}
                            autoFocus
                            style={{
                              width: "100%",
                              padding: "8px 10px",
                              borderRadius: "10px",
                              border: "1px solid #ddd",
                              outline: "none",
                              fontSize: "14px",
                              background: "#f9f9f9",
                            }}
                          />
                        ) : (
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              gap: "8px"
                            }}
                          >
                            {/* TEXT */}
                            <div>
                              {msg.is_deleted ? (
                                <span style={{ fontStyle: "italic", color: "#999" }}>
                                  🚫 Message deleted
                                </span>
                              ) : (
                                <>
                                  <span>{msg.content}</span>

                                  {msg.is_edited && (
                                    <span
                                      style={{
                                        fontSize: "11px",
                                        color: myMessage
                                          ? "rgba(201, 199, 199, 0.85)"
                                          : "#666",
                                        fontStyle: "italic",
                                        marginLeft: "4px",
                                      }}
                                    >
                                      edited
                                    </span>
                                  )}
                                </>
                              )}
                            </div>

                            {/* DELETE BUTTON */}
                            {myMessage && !msg.is_deleted && (
                              <span
                                onClick={(e) => {
                                e.stopPropagation()
                                handleDelete(msg.id)
                              }}
                                style={{
                                  fontSize: "12px",
                                  color: "#ff4d4f",
                                  cursor: "pointer"
                                }}
                              >
                                🗑
                              </span>
                            )}
                          </div>
                        )}
                        {msg.attachments?.map((file, index) => (
                          file.file_type === "image" ? (
                            <img
                              key={file.id || index}
                              src={file.file_url}
                              style={{
                                maxWidth: "220px",
                                borderRadius: "10px",
                                marginTop: "5px",
                                cursor: "pointer"
                              }}
                              onClick={(e) => {
                                e.stopPropagation(); // Disable message click
                                window.open(file.file_url, '_blank');
                              }}
                              alt="attachment"
                            />
                          ) : (
                            <a
                              key={file.id || index}
                              href={file.file_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{
                                display: "block",
                                marginTop: "5px",
                                color: myMessage ? "white" : "#007bff",
                                textDecoration: "none"
                              }}
                              onClick={(e) => e.stopPropagation()} // Disable message click
                            >
                              📎 {file.file_name || 'Download file'}
                            </a>
                          )
                        ))}
                      </div>

                      {/* Quick reaction indicator on hover */}
                      {!myMessage && (
                        <div style={styles.hintIndicator}>
                          👆 Click to react
                        </div>
                      )}
                    </div>
                    
                    {/* Reactions - always visible */}
                    <MessageReactions
                      message={msg}
                      currentUser={currentUser}
                    />

                    {activeMessage === msg.id && (
  <>
    {/* 🔥 EMOJI BAR */}
    <div
      onClick={(e) => e.stopPropagation()}
      style={{
        position: "absolute",
        top: "-50px",
        left: myMessage ? "auto" : "0",
        right: myMessage ? "0" : "auto",
        background: "#fff",
        borderRadius: "25px",
        padding: "6px 10px",
        display: "flex",
        gap: "8px",
        boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
        zIndex: 10
      }}
    >
      {["👍","❤️","😂","😮","😢","🔥"].map(e => (
        <span
          key={e}
          style={{ cursor: "pointer", fontSize: "18px" }}
          onClick={async () => {
            try {
              await api.post(`/messages/${msg.id}/reactions/`, {
                emoji: e
              })
            } catch (err) {
              console.error(err)
            }
            setActiveMessage(null)
          }}
        >
          {e}
        </span>
      ))}
    </div>

    {/* 🔥 MENU */}
    <div
      onClick={(e) => e.stopPropagation()}
      style={{
        position: "absolute",
        top: "45px",
        left: myMessage ? "auto" : "0",
        right: myMessage ? "0" : "auto",
        background: "#fff",
        borderRadius: "12px",
        padding: "8px",
        boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
        display: "flex",
        flexDirection: "column",
        gap: "6px",
        minWidth: "120px",
        zIndex: 10
      }}
    >
      <div
        style={{ cursor: "pointer" }}
        onClick={() => {
          onReply(msg)
          setActiveMessage(null)
        }}
      >
        ↩️ Reply
      </div>

      <div
        style={{ cursor: "pointer" }}
        onClick={() => {
          navigator.clipboard.writeText(msg.content)
          setActiveMessage(null)
        }}
      >
        📋 Copy
      </div>
    </div>
  </>
)}
                    
                    {/* Vaqt va status */}
                    <div style={styles.messageFooter}>
                      <span>{formatTime(msg.created_at)}</span>
                      
                      {myMessage && msg.status && (
                        <span style={{ 
                          color: getStatusColor(msg.status),
                          fontSize: "12px",
                          fontWeight: msg.status === 'read' ? 'bold' : 'normal',
                          marginLeft: "4px"
                        }}>
                          {getStatusIcon(msg.status)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </>
      )}
      <div ref={messagesEndRef} />
    </div>
  )
}

// Additional styles
const additionalStyles = `
  .message-reactions-container {
    display: flex;
    align-items: center;
    gap: 4px;
    margin-top: 4px;
    position: relative;
  }

  .reactions-bar {
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
  }

  .reaction-badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 8px;
    border: 1px solid #e0e0e0;
    border-radius: 20px;
    background: white;
    cursor: pointer;
    font-size: 13px;
    transition: all 0.2s;
    box-shadow: 0 1px 3px rgba(0,0,0,0.1);
  }

  .reaction-badge:hover {
    transform: scale(1.05);
    background: #f5f5f5;
    border-color: #007bff;
  }

  .reaction-badge.reacted {
    background: #e3f2fd;
    border-color: #007bff;
  }

  .reaction-emoji {
    font-size: 14px;
  }

  .reaction-count {
    font-size: 11px;
    font-weight: 600;
    color: #666;
  }

  .reaction-badge.reacted .reaction-count {
    color: #007bff;
  }

  .add-reaction-btn {
    width: 28px;
    height: 28px;
    border: 1px solid #e0e0e0;
    border-radius: 50%;
    background: white;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 16px;
    transition: all 0.2s;
    opacity: 0.7;
    box-shadow: 0 1px 3px rgba(0,0,0,0.1);
  }

  .add-reaction-btn:hover {
    opacity: 1;
    transform: scale(1.1);
    background: #f5f5f5;
    border-color: #007bff;
  }

  .reaction-picker {
    position: absolute;
    bottom: 100%;
    left: 0;
    background: white;
    border-radius: 20px;
    box-shadow: 0 5px 20px rgba(0,0,0,0.15);
    padding: 12px;
    z-index: 1000;
    margin-bottom: 8px;
    min-width: 240px;
    border: 1px solid #e0e0e0;
    animation: slideUp 0.2s ease;
  }

  @keyframes slideUp {
    from {
      opacity: 0;
      transform: translateY(10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .reaction-picker-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 10px;
    padding-bottom: 8px;
    border-bottom: 1px solid #e0e0e0;
  }

  .reaction-picker-header span {
    font-size: 13px;
    font-weight: 600;
    color: #666;
  }

  .reaction-picker-header button {
    border: none;
    background: none;
    font-size: 18px;
    cursor: pointer;
    color: #999;
  }

  .reaction-picker-header button:hover {
    color: #666;
  }

  .reaction-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 8px;
  }

  .reaction-option {
    width: 45px;
    height: 45px;
    border: 1px solid #e0e0e0;
    border-radius: 12px;
    background: white;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 24px;
    transition: all 0.2s;
  }

  .reaction-option:hover {
    transform: scale(1.1);
    background: #f5f5f5;
    border-color: #007bff;
  }

  .reaction-option.selected {
    background: #e3f2fd;
    border-color: #007bff;
    transform: scale(1.05);
  }

  /* Dark mode */
  @media (prefers-color-scheme: dark) {
    .reaction-badge {
      background: #2d3748;
      border-color: #4a5568;
      color: #e2e8f0;
    }

    .reaction-badge:hover {
      background: #374151;
    }

    .reaction-badge.reacted {
      background: #1e3a5f;
      border-color: #4299e1;
    }

    .reaction-count {
      color: #a0aec0;
    }

    .reaction-badge.reacted .reaction-count {
      color: #90cdf4;
    }

    .add-reaction-btn {
      background: #2d3748;
      border-color: #4a5568;
      color: #e2e8f0;
    }

    .add-reaction-btn:hover {
      background: #374151;
    }

    .reaction-picker {
      background: #1a202c;
      border-color: #4a5568;
    }

    .reaction-picker-header span {
      color: #e2e8f0;
    }

    .reaction-option {
      background: #2d3748;
      border-color: #4a5568;
    }

    .reaction-option:hover {
      background: #374151;
    }

    .reaction-option.selected {
      background: #1e3a5f;
      border-color: #4299e1;
    }
  }
`

// Add styles to document
const styleSheet = document.createElement("style")
styleSheet.textContent = additionalStyles
document.head.appendChild(styleSheet)

// Existing styles...
const styles = {
  container: {
    flex: 1,
    padding: "20px",
    overflowY: "auto",
    background: "#f0f2f5",
    position: "relative",
    display: "flex",
    flexDirection: "column",
    height: "100%"
  },
  emptyState: {
    height: "100%",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    color: "#666",
    textAlign: "center"
  },
  emptyIcon: {
    fontSize: "48px",
    marginBottom: "15px",
    animation: "bounce 2s infinite"
  },
  emptyText: {
    fontSize: "16px",
    marginBottom: "5px",
    fontWeight: "500"
  },
  emptySubtext: {
    fontSize: "14px",
    color: "#999"
  },
  dateDivider: {
    display: "flex",
    justifyContent: "center",
    margin: "20px 0"
  },
  dateText: {
    backgroundColor: "#e9ecef",
    padding: "5px 12px",
    borderRadius: "15px",
    fontSize: "12px",
    color: "#666",
    boxShadow: "0 1px 2px rgba(0,0,0,0.1)"
  },
  avatar: {
    width: "36px",
    height: "36px",
    borderRadius: "50%",
    background: "linear-gradient(135deg, #28a745, #20c997)",
    color: "white",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: "bold",
    fontSize: "16px",
    flexShrink: 0,
    boxShadow: "0 2px 4px rgba(0,0,0,0.1)"
  },
  senderName: {
    fontSize: "12px",
    fontWeight: "bold",
    marginBottom: "4px",
    color: "#495057",
    marginLeft: "4px"
  },
  messageBubble: {
    padding: "10px 15px",
    borderRadius: "15px",
    boxShadow: "0 1px 2px rgba(0,0,0,0.1)",
    wordBreak: "break-word",
    position: "relative",
    transition: "all 0.2s"
  },
  messageContent: {
    fontSize: "15px",
    lineHeight: "1.4"
  },
  messageFooter: {
    display: "flex",
    alignItems: "center",
    gap: "4px",
    marginTop: "4px",
    fontSize: "11px",
    color: "#666"
  },
  hintIndicator: {
    position: "absolute",
    top: "-20px",
    right: "0",
    fontSize: "10px",
    color: "#999",
    background: "rgba(0,0,0,0.05)",
    padding: "2px 8px",
    borderRadius: "12px",
    whiteSpace: "nowrap",
    opacity: 0,
    transition: "opacity 0.2s",
    pointerEvents: "none"
  }
}

// Add hover effect for hint
const hoverStyles = `
  .message-bubble:hover .hint-indicator {
    opacity: 1;
  }
`

styleSheet.textContent += hoverStyles

export default MessageList