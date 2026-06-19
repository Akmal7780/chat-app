import { useState, useEffect, useRef } from "react"
import toast from "react-hot-toast"
import api from "../api/axios"
import MessageList from "./MessageList"
import MessageInput from "./MessageInput"
import './ChatContainer.css'
import { useOnlineUsers } from "../context/OnlineUsersContext";

function ChatContainer({ selectedUser, currentUser, onBack, onSelectUser }) {
  const [replyMessage, setReplyMessage] = useState(null)
  const typingTimeoutRef = useRef(null)
  const [messages, setMessages] = useState([])
  const notificationSocketRef = useRef(null)
  const [conversation, setConversation] = useState(null)
  const [isConnected, setIsConnected] = useState(false)
  const [loading, setLoading] = useState(false)
  const notificationCountRef = useRef({})
  const [error, setError] = useState("")
  const [typingUser, setTypingUser] = useState(null)
  const { onlineUsers, setOnlineUsers, setUsers } = useOnlineUsers();
  const socketRef = useRef(null)
  const reconnectTimeoutRef = useRef(null)
  const [showMembers, setShowMembers] = useState(false)
  const [groupMembers, setGroupMembers] = useState([])
  const firstUnreadRef = useRef(null)
  const [memberSearchTerm, setMemberSearchTerm] = useState("") 
  const [search, setSearch] = useState("")
  const [searchResults, setSearchResults] = useState([])
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)
  // Filter members based on search
const filteredMembers = groupMembers.filter(member => 
  member.username?.toLowerCase().includes(memberSearchTerm.toLowerCase())
)

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
const highlightText = (text, search) => {
  if (!search || !text) return text;
  const regex = new RegExp(`(${search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  return text.replace(regex, '<mark>$1</mark>');
};
  const getAvatarColor = (name = "") => {
  const colors = [
    "#f44336",
    "#e91e63",
    "#9c27b0",
    "#673ab7",
    "#3f51b5",
    "#2196f3",
    "#009688",
    "#4caf50",
    "#ff9800",
    "#795548"
  ]

  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }

  return colors[Math.abs(hash) % colors.length]
}

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

const getIcon = (type) => {
  if (type === "image") return "📷"
  if (type === "file") return "📎"
  if (type === "video") return "🎥"
  return "💬"
}

// 🔔 NOTIFICATION SOCKET
useEffect(() => {
  const token = localStorage.getItem("token")
  if (!token) return

  const ws = new WebSocket(`${import.meta.env.VITE_WS_URL}/ws/notifications/?token=${token}`)

  notificationSocketRef.current = ws

  ws.onopen = () => console.log("🔔 Notification connected")

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data)

    if (data.type === "notification") {

  const activeConv = conversationRef.current

  if (activeConv && Number(activeConv.id) === Number(data.conversation_id)) {
    return
  }

  const sender = data.sender
  const key = `${sender}_${data.conversation_id}`

  notificationCountRef.current[key] =
    (notificationCountRef.current[key] || 0) + 1

  const count = notificationCountRef.current[key]

  toast.success(
  <div 
    style={{ display: "flex", flexDirection: "column", cursor: "pointer" }}
    onClick={() => {
  if (data.conversation_type === "group") {
    onSelectUser({
      id: Number(data.conversation_id),
      name: data.sender,
      type: "group",
    })
  } else {
    onSelectUser({
      id: data.sender_id,
      username: data.sender,
      type: "private",
    })
  }
  toast.dismiss(key)
}}
  >
    <span style={{ fontWeight: "bold" }}>
      {getIcon(data.notification_type)} {data.sender}
      {count > 1 && (
        <span style={{
          marginLeft: "6px",
          background: "#ef4444",
          color: "white",
          borderRadius: "10px",
          padding: "1px 7px",
          fontSize: "12px"
        }}>
          {count}
        </span>
      )}
    </span>
    <span>{data.text}</span>
  </div>,
  { 
    id: key,
    duration: 4000
  }
)
}
  }

  ws.onclose = () => console.log("🔌 Notification closed")

  return () => {
    ws.close()
  }
}, [currentUser]) 
  

  const processedReads = useRef(new Set())      
  const processedMessages = useRef(new Set())   
  const pendingMessages = useRef(new Map())   
const fetchGroupMembers = async () => {
  const convId = conversation?.id || selectedUser?.id
  if (!convId) return

  try {
    const res = await api.get(`/conversations/${convId}/members/`)
    setGroupMembers(res.data)
  } catch (err) {
    console.error("Members load error:", err)
  }
}

  useEffect(() => {
  if (!selectedUser || !currentUser) return

  if (conversation?.id === selectedUser?.id) return

  const initializeChat = async () => {
    setError("")

    try {
      // 🔔 notification reset
      const key = `${
        selectedUser.type === "group"
          ? selectedUser.name
          : selectedUser.username
      }_${selectedUser.id}`

      notificationCountRef.current[key] = 0

      let conversationData = null

      // =========================
      // 👥 GROUP CHAT
      // =========================
      if (selectedUser.type === "group") {
        conversationData = selectedUser
        setConversation(conversationData)

        await fetchMessages(conversationData.id)
        connectWebSocket(conversationData.id)

        return
      }

      // =========================
      // 👤 PRIVATE CHAT
      // =========================
      const convRes = await api.post("/conversations/", {
        participant_id: selectedUser.id,
        type: "private",
      })

      conversationData = convRes.data

      setConversation(conversationData)

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

}, [selectedUser?.id])   

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

        
      if (data.type === "message") {
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
  if (Number(selectedUser?.id) === Number(data.user_id)) {
    onSelectUser({
      ...selectedUser,
      last_seen: data.last_seen
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
      sender_username: currentUser.sender, 
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

  // Last seen format
  const formatLastSeen = (dateString) => {
    const date = new Date(dateString)
    const now = new Date()
    const diff = Math.floor((now - date) / 1000)

    if (diff < 60) return "just now"
    if (diff < 3600) return `${Math.floor(diff / 60)} minutes ago`
    if (diff < 86400) return `${Math.floor(diff / 3600)} hours ago`
    return date.toLocaleDateString()
  }




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
            fetchGroupMembers()
            setShowMembers(!showMembers)
          }
        }}
        style={{ cursor: selectedUser.type === "group" ? "pointer" : "default" }}>
        {selectedUser.avatar_url || selectedUser.avatar ? (
          <img
            src={selectedUser.avatar_url || selectedUser.avatar}
            alt={selectedUser.username || selectedUser.name}
          />
        ) : (
          <div
            className="avatar-placeholder"
            style={{
              background: getAvatarColor(
                selectedUser.username || selectedUser.name
              ),
            }}
          >
            {(selectedUser.username || selectedUser.name)?.[0]?.toUpperCase()}
          </div>
        )}

        {/* Online indicator faqat private chat uchun */}
        {selectedUser.type !== "group" && (
          <span
            className={`online-dot ${
              onlineUsers.has(Number(selectedUser.id)) ? "online" : "offline"
            }`}
          />
        )}
      </div>

      {/* Chat info */}
      <div className="chat-user-info">
        <h3 className="chat-username">
          {selectedUser.type === "group"
            ? selectedUser.name
            : selectedUser.username}
        </h3>

        {/* Group chat */}
        {selectedUser.type === "group" ? (
          <div className="user-status">
            {selectedUser.members_count} members
          </div>
        ) : /* Private chat */
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
            {onlineUsers.has(Number(selectedUser.id)) ? (
              <span>Online</span>
            ) : (
              <span>
                {selectedUser.last_seen
                  ? `last seen ${formatLastSeen(selectedUser.last_seen)}`
                  : "Recently"}
              </span>
            )}
          </div>
        )}
      </div>
    </>
  )}

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

  {showMembers && selectedUser?.type === "group" && (
    <div className="group-members-dropdown">
      <div className="dropdown-header">
        <div className="header-title">
          <span className="title-icon">👥</span>
          <h4>Group Members</h4>
        </div>
        <span className="members-count">{groupMembers.length} members</span>
        <button className="close-dropdown" onClick={() => {
          setShowMembers(false);
          setMemberSearchTerm('');
        }}>
          ×
        </button>
      </div>

      <div className="members-search">
        <input 
          type="text" 
          placeholder="Search members..." 
          className="search-input"
          value={memberSearchTerm}
          onChange={(e) => setMemberSearchTerm(e.target.value)}
          autoFocus
        />
        <span className="search-icon">🔍</span>
        {memberSearchTerm && (
          <button 
            className="clear-search"
            onClick={() => setMemberSearchTerm('')}
          >
            ×
          </button>
        )}
      </div>

      <div className="members-list">
        {filteredMembers.length === 0 ? (
          <div className="no-members">
            <span className="no-members-icon">
              {memberSearchTerm ? '🔍' : '👥'}
            </span>
            <p>
              {memberSearchTerm 
                ? `No members matching "${memberSearchTerm}"` 
                : 'No members found'}
            </p>
            {memberSearchTerm && (
              <button 
                className="clear-search-btn"
                onClick={() => setMemberSearchTerm('')}
              >
                Clear search
              </button>
            )}
          </div>
        ) : (
          filteredMembers.map(member => {
            const isOnline = onlineUsers.has(Number(member.user));
            const lastSeenText = member.last_seen ? formatLastSeen(member.last_seen) : null;
            
            return (
              <div
                key={member.id}
                className="member-item"
                onClick={() => {
                  setShowMembers(false)
                  setMemberSearchTerm('')
                  if (member.user !== currentUser.id) {
                    onSelectUser({
                      id: member.user,
                      username: member.username,
                      type: "private",
                      last_seen: member.last_seen
                    })
                  }
                }}
              >
                <div className="member-avatar-wrapper">
                  <div
                    className="member-avatar"
                    style={{ background: getAvatarColor(member.username) }}
                  >
                    {member.username[0].toUpperCase()}
                  </div>
                  <span className={`member-status-dot ${isOnline ? 'online' : 'offline'}`} />
                </div>

                <div className="member-details">
                  <div className="member-name-row">
                    <span className="member-name">{member.username}</span>
                    {member.user === currentUser.id && (
                      <span className="member-badge">You</span>
                    )}
                  </div>
                  
                  <div className="member-status-text">
                    {isOnline ? (
                      <span className="status-online">
                        <span className="status-bullet">●</span> Online
                      </span>
                    ) : (
                      <span className="status-offline">
                        <span className="status-bullet">●</span>
                        {lastSeenText ? `Last seen ${lastSeenText}` : 'Offline'}
                      </span>
                    )}
                  </div>
                </div>

                {member.user !== currentUser.id && (
                  <button 
                    className="message-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowMembers(false);
                      setMemberSearchTerm('');
                      onSelectUser({
                        id: member.user,
                        username: member.username,
                        type: "private",
                        last_seen: member.last_seen
                      });
                    }}
                    title="Send message"
                  >
                    💬
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>

      <div className="dropdown-footer">
        <button 
          className="invite-btn" 
          onClick={() => {
            alert('Invite members feature coming soon!');
          }}
        >
          <span className="invite-icon">➕</span>
          Invite Members
        </button>
      </div>
    </div>
  )}
</div>

  {/* Messages */}
  {currentUser ? (
    <MessageList
      messages={search ? searchResults : messages}
      currentUser={currentUser}
      selectedUser={selectedUser}
      onMessageVisible={markAsRead}
      socket={socketRef}
      onReply={setReplyMessage}
    />
  ) : (
    <div className="loading-user">Loading user data...</div>
  )}

  {/* Message Input */}
  <MessageInput
    onSendMessage={sendMessage}
    isConnected={isConnected}
    onTyping={sendTypingIndicator}
    conversation={conversation}
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

</div>
  )
}

export default ChatContainer