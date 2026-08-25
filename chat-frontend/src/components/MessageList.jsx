import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import toast from "react-hot-toast"
import MessageReactions from "./MessageReactions"
import LinkPreviewCard from "./LinkPreviewCard"
import MessageContextMenu from "./MessageContextMenu"
import { extractFirstUrl, URL_REGEX } from "../utils/linkify"
import { wallpaperStyleFor } from "./WallpaperPicker"
import ViewOnceAttachment from "./ViewOnceAttachment"
import api from "../api/axios"
import "./MessageList.css" // Import the CSS file

// Renders **bold**, __italic__, `code`, bare URLs, and @mention tokens as
// real React nodes (never dangerouslySetInnerHTML — text stays through
// React's normal escaping, so this can't reopen the search-highlight XSS
// class of bug). @mention highlighting is purely cosmetic here; the actual
// notification match is validated server-side against real participants.
const TOKEN_REGEX = new RegExp(
  `(\\*\\*.+?\\*\\*|__.+?__|\`[^\`]+?\`|@[\\w.+-]+|${URL_REGEX.source})`,
  "g"
)

function renderFormattedContent(text) {
  if (!text) return text

  return text.split(TOKEN_REGEX).map((part, i) => {
    if (!part) return null

    if (/^\*\*.+\*\*$/.test(part)) {
      return <strong key={i}>{part.slice(2, -2)}</strong>
    }
    if (/^__.+__$/.test(part)) {
      return <em key={i}>{part.slice(2, -2)}</em>
    }
    if (/^`[^`]+`$/.test(part)) {
      return <code key={i} className="message-inline-code">{part.slice(1, -1)}</code>
    }
    if (/^@[\w.+-]+$/.test(part)) {
      return <span key={i} className="message-list-mention">{part}</span>
    }
    if (URL_REGEX.test(part)) {
      return (
        <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="message-list-link">
          {part}
        </a>
      )
    }
    return part
  })
}

// Deterministic per-viewer shuffle so "Shuffle Options" doesn't reorder on
// every re-render — same poll + same viewer always yields the same order.
function shuffleOptionsFor(options, seed) {
  let s = seed >>> 0
  const rand = () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
  const arr = [...options]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

function PollBlock({ message, currentUser }) {
  const poll = message.poll
  const [voting, setVoting] = useState(false)
  const [addingOption, setAddingOption] = useState(false)
  const [newOptionText, setNewOptionText] = useState("")
  if (!poll) return null

  const myVotes = new Set(
    poll.options.filter((o) => o.voter_ids.includes(currentUser?.id)).map((o) => o.id)
  )
  const hasVoted = myVotes.size > 0
  const locked = poll.is_closed || (hasVoted && !poll.allow_revoting)
  const revealCorrect = poll.quiz_mode && hasVoted

  const displayOptions = poll.shuffle_options
    ? shuffleOptionsFor(poll.options, (poll.id || 0) * 2654435761 + (currentUser?.id || 0))
    : poll.options

  const handleVote = async (optionId) => {
    if (voting || locked) return
    // Multi-choice polls toggle within the full set of options I've already
    // picked — a single-option payload would silently wipe out the rest
    // (vote_poll replaces the caller's whole vote set on every call).
    const optionIds = poll.allows_multiple
      ? (myVotes.has(optionId)
          ? [...myVotes].filter((id) => id !== optionId)
          : [...myVotes, optionId])
      : [optionId]
    if (poll.allows_multiple && optionIds.length === 0) return
    setVoting(true)
    try {
      await api.post(`/messages/${message.id}/vote/`, { option_ids: optionIds })
    } catch (err) {
      console.error("Vote error:", err)
    } finally {
      setVoting(false)
    }
  }

  const handleAddOption = async () => {
    const text = newOptionText.trim()
    if (!text) return
    setAddingOption(true)
    try {
      await api.post(`/messages/${message.id}/add-option/`, { text })
      setNewOptionText("")
    } catch (err) {
      console.error("Add poll option error:", err)
    } finally {
      setAddingOption(false)
    }
  }

  return (
    <div className="message-list-poll">
      <div className="message-list-poll-question">
        {poll.quiz_mode ? "❓" : "📊"} {poll.question}
      </div>
      {poll.description && (
        <div className="message-list-poll-description">{poll.description}</div>
      )}
      <div className="message-list-poll-options">
        {displayOptions.map((option) => {
          const percent = poll.total_votes > 0 ? Math.round((option.vote_count / poll.total_votes) * 100) : 0
          const isMine = myVotes.has(option.id)
          const quizClass = revealCorrect
            ? option.is_correct
              ? "correct"
              : isMine
                ? "incorrect"
                : ""
            : ""
          const voterNames = (option.voters || []).map((v) => v.username)
          const showVoters = hasVoted && !poll.anonymous && voterNames.length > 0
          return (
            <div key={option.id} className="message-list-poll-option-wrap">
              <button
                className={`message-list-poll-option ${isMine ? "voted" : ""} ${quizClass}`}
                onClick={(e) => { e.stopPropagation(); handleVote(option.id) }}
                disabled={voting || locked}
              >
                {hasVoted && (
                  <div className="message-list-poll-option-bar" style={{ width: `${percent}%` }} />
                )}
                <span className="message-list-poll-option-text">
                  {revealCorrect ? (option.is_correct ? "✅ " : isMine ? "❌ " : "") : isMine ? "✓ " : ""}
                  {option.text}
                </span>
                {hasVoted && <span className="message-list-poll-option-percent">{percent}%</span>}
              </button>
              {showVoters && (
                <div className="message-list-poll-option-voters">
                  👤 {voterNames.slice(0, 3).join(", ")}
                  {voterNames.length > 3 ? ` +${voterNames.length - 3} more` : ""}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {poll.allow_adding_options && !poll.is_closed && (
        <div className="message-list-poll-add-option">
          <input
            type="text"
            placeholder="Add an option…"
            value={newOptionText}
            onChange={(e) => setNewOptionText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAddOption()}
            onClick={(e) => e.stopPropagation()}
            disabled={addingOption}
          />
          <button onClick={(e) => { e.stopPropagation(); handleAddOption() }} disabled={addingOption || !newOptionText.trim()}>
            Add
          </button>
        </div>
      )}

      <div className="message-list-poll-meta">
        {poll.total_votes} vote{poll.total_votes !== 1 ? "s" : ""}
        {poll.allows_multiple ? " · Multiple answers allowed" : ""}
        {poll.anonymous ? " · Anonymous" : ""}
        {poll.is_closed ? " · Closed" : ""}
      </div>
    </div>
  )
}

function MessageList({ messages, currentUser, selectedUser, onMessageVisible,socket,onReply, onForwardRequest, loading, wallpaperType, wallpaperValue, wallpaperUrl }) {
  const messagesEndRef = useRef(null)
  const [previewImage, setPreviewImage] = useState(null)
  const [previewPDF, setPreviewPDF] = useState(null)
  const messageRefs = useRef({})
  const clickTimeout = useRef(null)
  const processedReads = useRef(new Set())
  const observerRef = useRef(null)
  const [contextMenu, setContextMenu] = useState(null)
  const [reportTarget, setReportTarget] = useState(null)
  const [reportReason, setReportReason] = useState("")
  const [reportSubmitting, setReportSubmitting] = useState(false)
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

  // Browsers only decode a handful of video containers natively (no AVI,
  // WMV, MKV, FLV support) — for anything else <video> would just render
  // a black, unplayable box, so those get a download link instead.
  const WEB_PLAYABLE_VIDEO_EXT = new Set(["mp4", "webm", "ogg", "ogv"])
  const isWebPlayableVideo = (name) => {
    const ext = (name || "").split(".").pop()?.toLowerCase()
    return WEB_PLAYABLE_VIDEO_EXT.has(ext)
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

  const handleReportSubmit = async () => {
    const reason = reportReason.trim()
    if (!reason) {
      toast.error("Please describe the issue")
      return
    }
    setReportSubmitting(true)
    try {
      await api.post(`/messages/${reportTarget.id}/report/`, { reason })
      setReportTarget(null)
      setReportReason("")
      toast.success("Report submitted")
    } catch (err) {
      console.error("Report message error:", err)
      toast.error("Failed to submit report")
    } finally {
      setReportSubmitting(false)
    }
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
    <div className="message-list-container" style={wallpaperStyleFor(wallpaperType, wallpaperValue, wallpaperUrl)}>
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
                      className={`message-list-bubble ${myMessage ? 'my-message' : 'other-message'} ${msg.is_pinned ? 'pinned' : ''} ${msg.message_type === 'sticker' || msg.message_type === 'gif' ? 'bubble-transparent' : ''}`}
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
                        
                        {msg.message_type === "sticker" ? (
                          <span className="message-list-sticker">{msg.content}</span>
                        ) : msg.message_type === "gif" ? (
                          <img src={msg.content} alt="GIF" className="message-list-gif" />
                        ) : msg.message_type === "poll" ? (
                          <PollBlock message={msg} currentUser={currentUser} />
                        ) : msg.message_type === "call" ? (
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
                                  <span>{renderFormattedContent(msg.content)}</span>

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
                        
                        {msg.view_once ? (
                          <ViewOnceAttachment
                            message={msg}
                            isMine={myMessage}
                            fileType={msg.attachments?.[0]?.file_type}
                          />
                        ) : msg.attachments?.map((file) => {
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
                                  {isWebPlayableVideo(fileName) ? (
                                    <video
                                      width="220"
                                      controls
                                      onClick={(e) => e.stopPropagation()}
                                      className="message-list-attachment-video"
                                    >
                                      <source src={file.file_url} />
                                    </video>
                                  ) : (
                                    <a
                                      href={file.file_url}
                                      download={fileName}
                                      onClick={(e) => e.stopPropagation()}
                                      className="message-list-attachment-unplayable"
                                    >
                                      <span className="message-list-attachment-unplayable-icon">🎬⬇️</span>
                                      <span>This format can't be played here — click to download</span>
                                    </a>
                                  )}
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
                        {msg.scheduled_at ? (
                          <span className="message-list-scheduled-badge">
                            🕒 Scheduled for {new Date(msg.scheduled_at).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                          </span>
                        ) : (
                          <>
                            <span>{formatTime(msg.created_at)}</span>
                            {myMessage && msg.status && (
                              <span className={`message-list-status-${msg.status}`}>
                                {getStatusIcon(msg.status)}
                              </span>
                            )}
                          </>
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
            onReport={(msg) => { setReportReason(""); setReportTarget(msg) }}
          />
        )
      })()}

      {reportTarget && createPortal(
        <div className="poll-modal-overlay" onClick={() => setReportTarget(null)}>
          <div className="poll-modal" onClick={(e) => e.stopPropagation()}>
            <div className="poll-modal-header">
              <h3>⚠️ Report message</h3>
              <button onClick={() => setReportTarget(null)}>×</button>
            </div>
            <div className="poll-modal-body">
              <div className="export-hint">Tell us what's wrong with this message. This is sent to Nexus Chat moderators for review.</div>
              <textarea
                className="poll-description-input report-reason-textarea"
                placeholder="Describe the issue…"
                value={reportReason}
                onChange={(e) => setReportReason(e.target.value.slice(0, 1000))}
                rows={4}
                autoFocus
              />
            </div>
            <div className="poll-modal-footer">
              <button type="button" className="poll-cancel-btn" onClick={() => setReportTarget(null)}>
                Cancel
              </button>
              <button type="button" className="poll-submit-btn" onClick={handleReportSubmit} disabled={reportSubmitting}>
                {reportSubmitting ? "Submitting…" : "Submit report"}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

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