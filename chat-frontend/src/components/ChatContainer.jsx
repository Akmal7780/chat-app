import { useState, useEffect, useRef } from "react"
import toast from "react-hot-toast"
import api from "../api/axios"
import MessageList from "./MessageList"
import MessageInput from "./MessageInput"
import ForwardModal from "./ForwardModal"
import './ChatContainer.css'
import { useOnlineUsers } from "../context/OnlineUsersContext";
import { useChats } from "../context/ChatsContext"
import { useCall } from "../context/CallContext"
import ChannelInfoModal from "./ChannelInfoModal"
import UserInfoModal from "./UserInfoModal"
import GroupInfoModal from "./GroupInfoModal"
import { formatLastSeen } from "../utils/formatTime"
import { getAvatarColor } from "../utils/avatarColor"

function ChatContainer({ selectedUser, currentUser, onBack, onSelectUser, users }) {
  const [replyMessage, setReplyMessage] = useState(null)
  const typingTimeoutRef = useRef(null)
  const [messages, setMessages] = useState([])
  const [forwardingMessage, setForwardingMessage] = useState(null)
  const [conversation, setConversation] = useState(null)
  const [isConnected, setIsConnected] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [typingUser, setTypingUser] = useState(null)
  const { onlineUsers, setOnlineUsers, setUsers } = useOnlineUsers();
  const socketRef = useRef(null)
  const reconnectTimeoutRef = useRef(null)
  const [showGroupInfo, setShowGroupInfo] = useState(false)
  const [showChannelInfo, setShowChannelInfo] = useState(false)
  const [showUserInfo, setShowUserInfo] = useState(false)
  const [showSummary, setShowSummary] = useState(false)
  const [summaryText, setSummaryText] = useState("")
  const [summaryLoading, setSummaryLoading] = useState(false)
  const firstUnreadRef = useRef(null)
  const [search, setSearch] = useState("")
  const [searchResults, setSearchResults] = useState([])
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)

const handleSearchResultClick = (messageId) => {
  setSearch('')
  setSearchResults([])

  setTimeout(() => {
    const messageElement = document.getElementById(`message-${messageId}`)
    if (messageElement) {
      messageElement.scrollIntoView({ 
        behavior: 'smooth', 
        block: 'center' 
      })
      messageElement.classList.add('highlight-message')
      setTimeout(() => {
        messageElement.classList.remove('highlight-message')
      }, 2000)
    }
  }, 100)
}
const escapeHtml = (text) =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

const highlightText = (text, search) => {
  if (!text) return text;
  const escaped = escapeHtml(text);
  if (!search) return escaped;
  const regex = new RegExp(`(${search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  return escaped.replace(regex, '<mark>$1</mark>');
};
  const { conversations, updateConversation, upsertConversation } = useChats()
  const { openCallPrompt } = useCall()

  const conversationRef = useRef(null)

useEffect(() => {
  conversationRef.current = conversation
}, [conversation])

useEffect(() => {
  if (!socketRef.current || !conversation) return

  if (socketRef.current.readyState === WebSocket.OPEN) {
    socketRef.current.send(JSON.stringify({
      type: "active_chat",
      conversation_id: conversation.id
    }))
  }
}, [conversation])

  const processedReads = useRef(new Set())
  const processedMessages = useRef(new Set())
  const pendingMessages = useRef(new Map())
// Builds a normalized "selected chat" target for a group member,
// reusing an already-known private conversation with them if one exists.
const buildMemberChatTarget = (member) => {
  const existing = conversations.find(
    (c) => c.type === "private" && c.other_participant?.id === member.user
  )

  if (existing) {
    return {
      conversationId: existing.id,
      type: "private",
      displayName: existing.other_participant.username,
      avatarUrl: existing.other_participant.avatar_url,
      otherUserId: existing.other_participant.id,
      membersCount: null,
      isMuted: existing.is_muted,
      isPinned: existing.is_pinned,
      lastSeen: existing.other_participant.last_seen,
    }
  }

  return {
    conversationId: null,
    type: "private",
    displayName: member.username,
    avatarUrl: null,
    otherUserId: member.user,
    membersCount: null,
    isMuted: false,
    isPinned: false,
    lastSeen: member.last_seen,
  }
}

  useEffect(() => {
  if (!selectedUser || !currentUser) return

  if (conversation?.id === selectedUser?.conversationId) return

  const initializeChat = async () => {
    setError("")

    try {
      let conversationData = null

      // =========================
      // KNOWN CONVERSATION (row clicked in ChatsList, or a notification)
      // =========================
      if (selectedUser.conversationId) {
        const known = conversations.find(c => c.id === selectedUser.conversationId)

        conversationData = known || {
          id: selectedUser.conversationId,
          type: selectedUser.type,
          name: selectedUser.displayName,
        }

        setConversation(conversationData)

        // Optimistic UI update, immediately followed by the authoritative
        // server-side mark_read call — the per-message websocket "read"
        // event only fires for messages that actually scroll into view,
        // so it can't be relied on alone to persist "conversation opened"
        // as fully read (confirmed: MessageRead rows were never created
        // without this explicit call).
        updateConversation(selectedUser.conversationId, { unread_count: 0 })

        api.post(`/conversations/${selectedUser.conversationId}/mark_read/`)
          .then((res) => updateConversation(selectedUser.conversationId, res.data))
          .catch((err) => console.error("mark_read error:", err))

        await fetchMessages(conversationData.id)
        connectWebSocket(conversationData.id)

        return
      }

      // =========================
      // NEW PRIVATE CHAT (picked from "New chat" search results)
      // =========================
      const convRes = await api.post("/conversations/", {
        participant_id: selectedUser.otherUserId,
        type: "private",
      })

      conversationData = convRes.data

      setConversation(conversationData)
      upsertConversation(conversationData)

      await fetchMessages(conversationData.id)
      connectWebSocket(conversationData.id)

    } catch (error) {
      setError("Failed to initialize chat. Please try again.")
    }
  }

  initializeChat()

  // =========================
  // CLEANUP
  // =========================
  return () => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      console.log("🔌 Closing WebSocket connection...")
      socketRef.current.close()
    }

    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
    }

    processedReads.current.clear()
    processedMessages.current.clear()
    pendingMessages.current.clear()
    firstUnreadRef.current = null
  }

}, [selectedUser?.conversationId, selectedUser?.otherUserId])

  useEffect(() => {
  const delay = setTimeout(() => {
    if (search.trim()) {
      setPage(1)
      fetchSearch(1)
    } else {
      setSearchResults([])
    }
  }, 400)

  return () => clearTimeout(delay)
}, [search])

  const connectWebSocket = (convId) => {

    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
    }

    const token = localStorage.getItem("token")

    if (!token) {
      setError("Authentication token not found")
      return
    }

    const wsUrl = `${import.meta.env.VITE_WS_URL}/ws/chat/${convId}/?token=${token}`

    const ws = new WebSocket(wsUrl)

    ws.onopen = () => {
      setIsConnected(true)
      setError("")
      processedReads.current.clear()
      processedMessages.current.clear()

      // 🔥 ACTIVE CHAT 
      ws.send(JSON.stringify({
        type: "active_chat",
        conversation_id: convId
      }))
    }

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)


      if (data.type === "error") {
        toast.error(data.message || "Something went wrong")
      }
      else if (data.type === "message") {
  const msg = data.data
   console.log("📨 Kelgan xabar:", msg)        
  console.log("📨 temp_id:", msg?.temp_id)    
  if (!msg) return

  const messageKey = `message_${msg.id}`
  if (processedMessages.current.has(messageKey)) return
  processedMessages.current.add(messageKey)
  if (processedMessages.current.size > 1000) processedMessages.current.clear()


  const normalizedMsg = {
    ...msg,
    sender_id: msg.sender_id || msg.sender,
  }

  if (conversationRef.current) {
    updateConversation(conversationRef.current.id, {
      last_message: {
        id: normalizedMsg.id,
        content: normalizedMsg.content,
        sender_id: normalizedMsg.sender_id,
        sender_username: normalizedMsg.sender_username,
        created_at: normalizedMsg.created_at,
        message_type: normalizedMsg.message_type,
        is_deleted: normalizedMsg.is_deleted,
      },
    })
  }

 setMessages(prev => {
  const tempMessage = prev.find(m =>
    m.id === normalizedMsg.temp_id
  )

  if (tempMessage) {
    return prev.map(m =>
      m.id === normalizedMsg.temp_id
        ? { ...normalizedMsg, status: "sent" }
        : m
    )
  }

  if (prev.some(m => m.id === normalizedMsg.id)) {
    return prev
  }

  return [
    ...prev,
    { ...normalizedMsg, status: normalizedMsg.status || "sent" }
  ]
})
}
        
        else if (data.type === "read") {
          setMessages(prev => 
            prev.map(msg => 
              msg.id === data.message_id 
                ? { ...msg, status: "read" } 
                : msg
            )
          )
        }
        
        // ONLINE USERS SYNC
        else if (data.type === "online_users_list") {
          setOnlineUsers(new Set(data.users))
        }
        else if (data.type === "user_online") {
          setOnlineUsers(prev => new Set([...prev, Number(data.user_id)]))
        }
        else if (data.type === "user_offline") {
  setOnlineUsers(prev => {
    const updated = new Set(prev)
    updated.delete(Number(data.user_id))
    return updated
  })

  // 🔥 selectedUser update
  if (Number(selectedUser?.otherUserId) === Number(data.user_id)) {
    onSelectUser({
      ...selectedUser,
      lastSeen: data.last_seen
    })
  }

  // 🔥 USERS LIST update 
  setUsers(prev =>
  prev.map(u => {
    console.log("COMPARE:", u.id, data.user_id)  

    return String(u.id) === String(data.user_id)
      ? { ...u, last_seen: data.last_seen }
      : u
  })
)
}
        
        // TYPING INDICATOR
        else if (data.type === "typing_start") {
          setTypingUser(data.username)
        }
        else if (data.type === "typing_stop") {
          setTypingUser(null)
        }
        // ChatContainer.jsx - reaction handler 
      else if (data.type === "reaction") {

        setMessages(prev =>
          prev.map(msg => {
            if (msg.id !== data.message_id) return msg

            let reactions = msg.reactions ? [...msg.reactions] : []

            // =========================
            // ❌ REMOVE
            // =========================
            if (data.action === "removed") {
              reactions = reactions.filter(r => 
                r && r.user_id !== data.user_id
              )
            }

            // =========================
            // ✅ ADD / REPLACE
            // =========================
            else if (data.action === "added") {
              const newReaction = data.reaction

              if (!newReaction || !newReaction.emoji) {
                console.warn("⚠️ Invalid reaction:", data)
                return msg
              }

              
              reactions = reactions.filter(r => 
                r && r.user_id !== newReaction.user_id
              )

             
              reactions.push(newReaction)
            }

            return { ...msg, reactions }
          })
        )
      }

      // 🔥 MESSAGE EDIT
      else if (data.type === "message_edited") {
        console.log("✏️ Message edited:", data);

        setMessages(prev =>
          prev.map(msg =>
            msg.id === data.message_id
              ? {
                  ...msg,
                  content: data.content,
                  is_edited: true
                }
              : msg
          )
        );
      }

      // 🔥 MESSAGE DELETE
      else if (data.type === "message_deleted") {

  setMessages(prev =>
    prev.map(msg =>
      msg.id === data.message_id
        ? { 
            ...msg, 
            is_deleted: true, 
            content: "", 
            attachments: [],
            reactions: []
          }
        : msg
    )
  )
}

else if (data.type === "file_infected") {
  setMessages(prev =>
    prev.map(msg =>
      Number(msg.id) === Number(data.message_id)
        ? {
            ...msg,
            is_deleted: true,
            content: "🚨 File removed (virus detected)",
            attachments: []
          }
        : msg
    )
  )

  toast.error("File removed (virus detected)")
}

// 📌 MESSAGE PIN/UNPIN
else if (data.type === "message_pin_changed") {
  setMessages(prev =>
    prev.map(msg =>
      Number(msg.id) === Number(data.message_id)
        ? { ...msg, is_pinned: data.is_pinned }
        : msg
    )
  )
}

// ➡️ FORWARD RESULT (only sent back to the user who requested it)
else if (data.type === "forward_result") {
  if (data.success) {
    toast.success("Message forwarded")

    updateConversation(data.target_conversation_id, {
      last_message: {
        id: data.message.id,
        content: data.message.content,
        sender_id: data.message.sender,
        sender_username: data.message.sender_username,
        created_at: data.message.created_at,
        message_type: data.message.message_type,
        is_deleted: false,
      },
    })
  } else {
    toast.error(data.error || "Failed to forward message")
  }
}
      } catch (error) {
        console.error("❌ Error parsing message:", error)
      }
    }

    ws.onerror = (error) => {
      console.error("❌ WS error:", error)
      setIsConnected(false)
    }

    ws.onclose = (event) => {
      setIsConnected(false)
      processedReads.current.clear()
      processedMessages.current.clear()

      if (event.code !== 1000) {
        console.log("🔄 Reconnecting in 3 seconds...")
        reconnectTimeoutRef.current = setTimeout(() => {
          console.log("🔄 Reconnecting...")
          connectWebSocket(convId)
        }, 3000)
      }
    }

    socketRef.current = ws
  }


  const handleScroll = (e) => {
  const bottom =
    e.target.scrollHeight - e.target.scrollTop <= e.target.clientHeight + 50

  if (bottom && hasMore) {
    const next = page + 1
    setPage(next)
    fetchSearch(next)
  }
}


  const fetchMessages = async (convId) => {
    try {
setLoading(true)
      if (!currentUser) {
        setTimeout(() => fetchMessages(convId), 200)
        return
      }

      const res = await api.get(`/messages/?conversation=${convId}`)

      const data = res.data.results || res.data

      if (Array.isArray(data)) {
        const messagesWithStatus = data.map(msg => ({
          ...msg,
          sender_id: msg.sender_id || msg.sender,
          status: msg.status || "sent",
        }))

        setMessages(messagesWithStatus)
      } else {
        setMessages([])
      }

    } catch (error) {
      console.error("❌ Fetch messages error:", error)
      setError("Failed to load messages")
    }
    finally {
    setLoading(false)   
  }
  }

  const fetchSearch = async (pageNum) => {
  if (!conversation) return

  const res = await api.get("/messages/search/", {
    params: {
      q: search,
      conversation_id: conversation.id,
      page: pageNum
    }
  })

  if (pageNum === 1) {
    setSearchResults(res.data)
  } else {
    setSearchResults(prev => [...prev, ...res.data])
  }

  if (res.data.length < 20) {
    setHasMore(false)
  }
}


  const sendMessage = (messageText, attachments = [], reply) => {
    if (!messageText?.trim() && attachments.length === 0) {
      alert("Message cannot be empty!")
      return
    }

    if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
      alert("WebSocket not connected!")
      return
    }

    const tempId = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    const now = new Date().toISOString()

    pendingMessages.current.set(tempId, {
      content: messageText.trim(),
      attachments,
      time: now
    })

    // Optimistic message
    setMessages(prev => [...prev, {
      id: tempId,
      sender_id: currentUser.id,
      sender: currentUser.username,
      sender_username: currentUser.username,
      content: messageText.trim(),
      attachments: attachments,
      created_at: now,
      status: "sending",
      reply_to: reply
        ? {
            id: reply.id,
            sender: reply.sender,
            sender_id: reply.sender_id,
            content: reply.content,
            is_deleted: reply.is_deleted
          }
        : null
    }])

    if (conversation) {
      updateConversation(conversation.id, {
        last_message: {
          id: tempId,
          content: messageText.trim(),
          sender_id: currentUser.id,
          sender_username: currentUser.username,
          created_at: now,
          message_type: attachments.length ? "file" : "text",
          is_deleted: false,
        },
      })
    }

    socketRef.current.send(JSON.stringify({
      type: "message",
      message: messageText.trim(),
      attachments: attachments,
      reply_to: reply?.id || null,
      temp_id: tempId   
    }))
    setReplyMessage(null)

    setTimeout(() => {
      pendingMessages.current.delete(tempId)

      setMessages(prev =>
        prev.map(msg =>
          msg.id === tempId && msg.status === "sending"
            ? { ...msg, status: "error" }
            : msg
        )
      )
    }, 2000)
  }

  // Typing indicator
  const sendTypingIndicator = () => {
    if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
      return
    }

    socketRef.current.send(JSON.stringify({
      type: "typing_start"
    }))

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current)
    }

    typingTimeoutRef.current = setTimeout(() => {
      socketRef.current.send(JSON.stringify({
        type: "typing_stop"
      }))
    }, 2000)
  }


  const handleSummarize = async () => {
    setShowSummary(true)
    setSummaryLoading(true)
    setSummaryText("")

    try {
      const contents = messages
        .filter((m) => !m.is_deleted && m.content?.trim())
        .slice(-50)
        .map((m) => `${m.sender_username || m.sender}: ${m.content}`)

      if (contents.length === 0) {
        setSummaryText("Not enough messages to summarize yet.")
        return
      }

      const res = await api.post("/ai/summary/", { messages: contents })
      setSummaryText(res.data.summary)
    } catch (err) {
      console.error("Summary error:", err)
      setSummaryText("Failed to generate summary. Please try again.")
    } finally {
      setSummaryLoading(false)
    }
  }

  const markAsRead = (messageId) => {
    if (!socketRef.current || !isConnected) return
    
    if (processedReads.current.has(messageId)) {
      return
    }
    
    const message = messages.find(m => m.id === messageId)
    
    if (message && !message.is_deleted && message.sender_id !== currentUser?.id) {
      console.log("👁 Marking as read:", messageId)
      processedReads.current.add(messageId)
      
      socketRef.current.send(JSON.stringify({
        type: "read",
        message_id: messageId
      }))
    }
  }

  const isSavedMessages = selectedUser?.type === "private" && selectedUser?.otherUserId === currentUser?.id

  if (error) {
    return (
      <div className="chat-error">
        <p>{error}</p>
        <button onClick={() => window.location.reload()}>
          Try Again
        </button>
      </div>
    )
  }

  return (
    <div className="chat-container">
      {/* {loading && (
      <div className="overlay-loading">
        <div className="loading-spinner"></div>
        <p>Loading chat...</p>
      </div>
    )} */}

  {/* Chat Header */}
  <div className="chat-header">
  <button onClick={onBack} className="back-button">
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path
        d="M19 12H5M5 12L12 19M5 12L12 5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  </button>

  {selectedUser && (
    <>
      {/* Avatar */}
      <div className="chat-avatar"
        onClick={() => {
          if (selectedUser.type === "group") {
            setShowGroupInfo(true)
          } else if (selectedUser.type === "channel") {
            setShowChannelInfo(true)
          } else if (selectedUser.type === "private" && !isSavedMessages) {
            setShowUserInfo(true)
          }
        }}
        style={{ cursor: (selectedUser.type === "group" || selectedUser.type === "channel" || (selectedUser.type === "private" && !isSavedMessages)) ? "pointer" : "default" }}>
        {selectedUser.avatarUrl ? (
          <img
            src={selectedUser.avatarUrl}
            alt={selectedUser.displayName}
          />
        ) : (
          <div
            className="avatar-placeholder"
            style={{
              background: getAvatarColor(selectedUser.displayName),
            }}
          >
            {selectedUser.displayName?.[0]?.toUpperCase()}
          </div>
        )}

        {/* Online indicator faqat private chat uchun (Saved Messages bundan mustasno) */}
        {selectedUser.type === "private" && !isSavedMessages && (
          <span
            className={`online-dot ${
              onlineUsers.has(Number(selectedUser.otherUserId)) ? "online" : "offline"
            }`}
          />
        )}
      </div>

      {/* Chat info */}
      <div className="chat-user-info">
        <h3 className="chat-username">
          {selectedUser.displayName}
        </h3>

        {/* Group chat */}
        {selectedUser.type === "group" ? (
          <div className="user-status">
            {conversation?.members_count ?? selectedUser.membersCount} members
          </div>
        ) : selectedUser.type === "channel" ? (
          <div className="user-status">
            {(() => {
              const count = conversation?.members_count ?? selectedUser.membersCount ?? 0
              return `${count} ${count === 1 ? "subscriber" : "subscribers"}`
            })()}
          </div>
        ) : isSavedMessages ? null : /* Private chat */
        typingUser ? (
          <div className="typing-indicator">
            <span className="typing-text">Typing </span>

            <div className="typing-dots">
              <span></span>
              <span></span>
              <span></span>
            </div>
          </div>
        ) : (
          <div className="user-status">
            {onlineUsers.has(Number(selectedUser.otherUserId)) ? (
              <span>Online</span>
            ) : (
              <span>
                {selectedUser.lastSeen
                  ? `last seen ${formatLastSeen(selectedUser.lastSeen)}`
                  : "Recently"}
              </span>
            )}
          </div>
        )}
      </div>
    </>
  )}

  {/* Call */}
  {selectedUser && selectedUser.type === "private" && !isSavedMessages && (
    <button
      className="call-header-btn"
      onClick={() =>
        openCallPrompt(
          {
            id: selectedUser.otherUserId,
            username: selectedUser.displayName,
            avatarUrl: selectedUser.avatarUrl,
          },
          selectedUser.conversationId
        )
      }
      title="Call"
    >
      📞
    </button>
  )}

  {/* Summarize chat */}
  <button
    className="summarize-btn"
    onClick={handleSummarize}
    title="Summarize chat"
  >
    ✨
  </button>

  {/* MODERN SEARCH BAR - O'ng tomonda */}
  <div className="search-wrapper">
    <div className={`search-container ${search ? 'has-value' : ''}`}>
      <span className="search-icon">🔍</span>
      <input
        type="text"
        placeholder="Search messages..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="search-input-modern"
      />
      {search && (
        <button 
          className="clear-search-btn"
          onClick={() => setSearch('')}
        >
          ✕
        </button>
      )}
    </div>
    
    {/* Search Results Dropdown */}
    {search && (
      <div className="search-results-dropdown">
        <div className="search-results-header">
          <span className="results-count">{searchResults.length} messages found</span>
          <span className="search-term">"{search}"</span>
        </div>
        <div className="search-results-list" onScroll={handleScroll}>
          {searchResults.length === 0 ? (
            <div className="no-results">
              <span className="no-results-icon">🔍</span>
              <p>No messages found</p>
              <span className="no-results-hint">Try different keywords</span>
            </div>
          ) : (
            searchResults.map((msg, idx) => (
              <div key={msg.id || idx} className="search-result-item" onClick={() => handleSearchResultClick(msg.id)}
              style={{ cursor: 'pointer' }}>
                
                <div className="result-avatar">
                  <div className="result-avatar-placeholder" style={{ background: getAvatarColor(msg.sender_username || msg.sender) }}>
                    {(msg.sender_username || msg.sender)?.[0]?.toUpperCase()}
                  </div>
                </div>
                <div className="result-content">
                  <div className="result-header">
                    <span className="result-sender">{msg.sender_username || msg.sender}</span>
                    <span className="result-time">
                      {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <div 
                    className="result-message"
                    dangerouslySetInnerHTML={{
                      __html: highlightText(msg.content || msg.text || '', search)
                    }}
                  />
                </div>
              </div>
            ))
          )}
          {hasMore && searchResults.length > 0 && (
            <div className="loading-more">Loading more...</div>
          )}
        </div>
      </div>
    )}
  </div>

  {showChannelInfo && selectedUser?.type === "channel" && conversation && (
    <ChannelInfoModal
      conversation={conversation}
      currentUser={currentUser}
      allUsers={users}
      onClose={() => setShowChannelInfo(false)}
      onMuteToggled={(updated) => { setConversation(updated); updateConversation(updated.id, updated) }}
      onUpdated={(updated) => { setConversation((prev) => ({ ...prev, ...updated })); updateConversation(conversation.id, updated) }}
      onLeft={() => onBack?.()}
    />
  )}

  {showUserInfo && selectedUser?.type === "private" && !isSavedMessages && conversation?.other_participant && (
    <UserInfoModal
      otherUser={conversation.other_participant}
      conversationId={conversation.id}
      autoDeleteSeconds={conversation.auto_delete_seconds}
      isMuted={conversation.is_muted}
      isOnline={onlineUsers.has(Number(selectedUser.otherUserId))}
      messages={messages}
      onClose={() => setShowUserInfo(false)}
      onMuteToggled={(updated) => { setConversation(updated); updateConversation(updated.id, updated) }}
      onBlockToggled={(updatedUser) => {
        setConversation((prev) => ({ ...prev, other_participant: updatedUser }))
      }}
      onAutoDeleteUpdated={(updated) => { setConversation((prev) => ({ ...prev, ...updated })); updateConversation(conversation.id, updated) }}
      onCall={() => {
        setShowUserInfo(false)
        openCallPrompt(
          {
            id: selectedUser.otherUserId,
            username: selectedUser.displayName,
            avatarUrl: selectedUser.avatarUrl,
          },
          selectedUser.conversationId
        )
      }}
    />
  )}

  {showGroupInfo && selectedUser?.type === "group" && conversation && (
    <GroupInfoModal
      conversation={conversation}
      currentUser={currentUser}
      allUsers={users}
      onlineUsers={onlineUsers}
      onClose={() => setShowGroupInfo(false)}
      onMuteToggled={(updated) => { setConversation(updated); updateConversation(updated.id, updated) }}
      onUpdated={(updated) => { setConversation((prev) => ({ ...prev, ...updated })); updateConversation(conversation.id, updated) }}
      onLeft={() => onBack?.()}
      onSelectMember={(member) => {
        setShowGroupInfo(false)
        if (member.user !== currentUser.id) {
          onSelectUser(buildMemberChatTarget(member))
        }
      }}
    />
  )}
</div>

  {/* PINNED MESSAGE BANNER */}
  {(() => {
    const pinned = messages.filter(m => m.is_pinned && !m.is_deleted).slice(-1)[0]
    if (!pinned) return null

    return (
      <div
        className="pinned-message-banner"
        onClick={() => {
          document.getElementById(`message-${pinned.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" })
        }}
      >
        <span className="pinned-message-icon">📌</span>
        <span className="pinned-message-text">{pinned.content || "Attachment"}</span>
        <button
          className="pinned-message-close"
          onClick={(e) => {
            e.stopPropagation()
            socketRef.current?.send(JSON.stringify({
              type: "unpin_message",
              message_id: pinned.id,
            }))
          }}
        >
          ×
        </button>
      </div>
    )
  })()}

  {/* Messages */}
  {currentUser ? (
    <MessageList
      messages={search ? searchResults : messages}
      currentUser={currentUser}
      selectedUser={selectedUser}
      onMessageVisible={markAsRead}
      socket={socketRef}
      onReply={setReplyMessage}
      onForwardRequest={setForwardingMessage}
    />
  ) : (
    <div className="loading-user">Loading user data...</div>
  )}

  {forwardingMessage && (
    <ForwardModal
      onClose={() => setForwardingMessage(null)}
      onForward={(targetConversationId) => {
        socketRef.current?.send(JSON.stringify({
          type: "forward_message",
          message_id: forwardingMessage.id,
          target_conversation_id: targetConversationId,
        }))
        setForwardingMessage(null)
      }}
    />
  )}

  {/* Message Input */}
  <MessageInput
    onSendMessage={sendMessage}
    isConnected={isConnected}
    onTyping={sendTypingIndicator}
    conversation={conversation}
    messages={messages}
    currentUser={currentUser}
    replyMessage={replyMessage}     
    onCancelReply={() => setReplyMessage(null)} 
    onFileUploaded={(message) => {
  setMessages((prev) => {
    // 🔴 REMOVE TEMP
    if (message.remove) {
      return prev.filter((m) => m.id !== message.id)
    }

    // 🔴 UPDATE (progress)
    const exists = prev.find((m) => m.id === message.id)
    if (exists) {
      return prev.map((m) =>
        m.id === message.id ? { ...m, ...message } : m
      )
    }

    // 🔴 ADD
    return [...prev, message]
  })
}}
  />

  {showSummary && (
    <div className="summary-modal-overlay" onClick={() => setShowSummary(false)}>
      <div className="summary-modal" onClick={(e) => e.stopPropagation()}>
        <div className="summary-modal-header">
          <h3>✨ Chat Summary</h3>
          <button onClick={() => setShowSummary(false)}>×</button>
        </div>
        <div className="summary-modal-body">
          {summaryLoading ? (
            <div className="summary-loading">Summarizing…</div>
          ) : (
            <p>{summaryText}</p>
          )}
        </div>
      </div>
    </div>
  )}

</div>
  )
}

export default ChatContainer