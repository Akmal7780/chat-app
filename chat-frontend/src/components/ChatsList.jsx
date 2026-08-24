import { useEffect, useMemo, useState } from "react"
import "./ChatsList.css"
import api from "../api/axios"
import { useChats } from "../context/ChatsContext"
import { useOnlineUsers } from "../context/OnlineUsersContext"
import { formatChatTimestamp } from "../utils/formatTime"
import { getAvatarColor } from "../utils/avatarColor"
import { getDraft, onDraftUpdated } from "../utils/drafts"

function ChatRow({ conversation, isActive, isOnline, onClick, menuOpen, onToggleMenu, onPinToggle, onMuteToggle }) {
  const isGroup = conversation.type === "group"
  const isChannel = conversation.type === "channel"
  const isPrivate = !isGroup && !isChannel
  const other = conversation.other_participant

  const displayName = !isPrivate ? conversation.name : other?.username || "Unknown"
  const avatarUrl = isPrivate ? other?.avatar_url : conversation.avatar_url

  const lastMessage = conversation.last_message

  const [draft, setDraftState] = useState(() => getDraft(conversation.id))
  useEffect(() => {
    setDraftState(getDraft(conversation.id))
    return onDraftUpdated((updatedId) => {
      if (String(updatedId) === String(conversation.id)) {
        setDraftState(getDraft(conversation.id))
      }
    })
  }, [conversation.id])

  const callPreview = (call) => {
    const icon = call.call_is_video ? "🎥" : "📞"
    if (call.call_status === "completed") return `${icon} Call`
    if (call.call_status === "declined") return `${icon} Declined call`
    return `${icon} Missed call`
  }
  const preview = draft
    ? <><span className="chat-row-draft-label">Draft: </span>{draft}</>
    : !lastMessage
    ? "No messages yet"
    : lastMessage.is_deleted
    ? "This message was deleted"
    : lastMessage.message_type === "call"
    ? callPreview(lastMessage)
    : `${lastMessage.sender_username ? lastMessage.sender_username + ": " : ""}${lastMessage.content || "📎 Attachment"}`

  const unread = conversation.unread_count || 0
  const showNumberBadge = unread > 0 && !conversation.is_muted
  const showMutedDot = unread > 0 && conversation.is_muted

  return (
    <div
      className={`chat-row ${isActive ? "active" : ""} ${conversation.is_pinned ? "pinned" : ""}`}
      onClick={() => onClick(conversation)}
    >
      <div className="chat-row-avatar">
        {avatarUrl ? (
          <img src={avatarUrl} alt={displayName} />
        ) : isGroup ? (
          <div className="chat-row-avatar-placeholder group">👥</div>
        ) : isChannel ? (
          <div className="chat-row-avatar-placeholder channel">📢</div>
        ) : (
          <div
            className="chat-row-avatar-placeholder"
            style={{ backgroundColor: getAvatarColor(displayName) }}
          >
            {displayName?.[0]?.toUpperCase()}
          </div>
        )}
        {isPrivate && (
          <span className={`chat-row-status-dot ${isOnline ? "online" : "offline"}`} />
        )}
      </div>

      <div className="chat-row-body">
        <div className="chat-row-top">
          <span className="chat-row-name">
            {conversation.is_pinned && <span className="chat-row-pin-icon">📌</span>}
            {displayName}
          </span>
          <span className="chat-row-time">
            {formatChatTimestamp(lastMessage?.created_at)}
          </span>
        </div>

        <div className="chat-row-bottom">
          <span className="chat-row-preview">{preview}</span>

          <span className="chat-row-meta">
            {conversation.is_muted && <span className="chat-row-muted-icon">🔕</span>}
            {showMutedDot && <span className="chat-row-dot" />}
            {showNumberBadge && <span className="chat-row-badge">{unread}</span>}
          </span>
        </div>
      </div>

      <button
        className="chat-row-menu-btn"
        onClick={(e) => {
          e.stopPropagation()
          onToggleMenu(conversation.id)
        }}
        title="More"
      >
        ⋮
      </button>

      {menuOpen && (
        <div className="chat-row-menu" onClick={(e) => e.stopPropagation()}>
          <button onClick={() => onPinToggle(conversation)}>
            {conversation.is_pinned ? "📌 Unpin" : "📌 Pin"}
          </button>
          <button onClick={() => onMuteToggle(conversation)}>
            {conversation.is_muted ? "🔔 Unmute" : "🔕 Mute"}
          </button>
        </div>
      )}
    </div>
  )
}

function SavedMessagesRow({ conversation, isActive, onClick }) {
  const lastMessage = conversation?.last_message
  const preview = !lastMessage
    ? "Your personal notes"
    : lastMessage.is_deleted
    ? "This message was deleted"
    : lastMessage.content || "📎 Attachment"

  return (
    <div
      className={`chat-row saved-messages-row ${isActive ? "active" : ""}`}
      onClick={onClick}
    >
      <div className="chat-row-avatar">
        <div className="chat-row-avatar-placeholder saved-messages-icon">🔖</div>
      </div>
      <div className="chat-row-body">
        <div className="chat-row-top">
          <span className="chat-row-name">Saved Messages</span>
          {lastMessage && (
            <span className="chat-row-time">
              {formatChatTimestamp(lastMessage.created_at)}
            </span>
          )}
        </div>
        <div className="chat-row-bottom">
          <span className="chat-row-preview">{preview}</span>
        </div>
      </div>
    </div>
  )
}

function NewChatRow({ user, onClick }) {
  return (
    <div className="chat-row new-chat-row" onClick={() => onClick(user)}>
      <div className="chat-row-avatar">
        {user.avatar_url || user.avatar ? (
          <img src={user.avatar_url || user.avatar} alt={user.username} />
        ) : (
          <div
            className="chat-row-avatar-placeholder"
            style={{ backgroundColor: getAvatarColor(user.username) }}
          >
            {user.username?.[0]?.toUpperCase()}
          </div>
        )}
      </div>
      <div className="chat-row-body">
        <div className="chat-row-top">
          <span className="chat-row-name">{user.username}</span>
        </div>
        <div className="chat-row-bottom">
          <span className="chat-row-preview">Start a new chat</span>
        </div>
      </div>
    </div>
  )
}

function ChatsList({ searchTerm, folderTab, currentUser, onSelectChat, selectedConversationId }) {
  const { conversations, loading, updateConversation, upsertConversation, folders } = useChats()
  const { users, onlineUsers } = useOnlineUsers()
  const [openMenuId, setOpenMenuId] = useState(null)
  const [messageResults, setMessageResults] = useState([])

  const savedMessagesConversation = useMemo(
    () => conversations.find((c) => c.type === "private" && !c.other_participant) || null,
    [conversations]
  )

  useEffect(() => {
    if (openMenuId === null) return
    const closeMenu = () => setOpenMenuId(null)
    document.addEventListener("click", closeMenu)
    return () => document.removeEventListener("click", closeMenu)
  }, [openMenuId])

  const handlePinToggle = async (conversation) => {
    setOpenMenuId(null)
    const action = conversation.is_pinned ? "unpin" : "pin"
    try {
      const res = await api.post(`/conversations/${conversation.id}/${action}/`)
      updateConversation(conversation.id, res.data)
    } catch (err) {
      console.error("Pin toggle error:", err)
    }
  }

  const handleMuteToggle = async (conversation) => {
    setOpenMenuId(null)
    const action = conversation.is_muted ? "unmute" : "mute"
    try {
      const res = await api.post(`/conversations/${conversation.id}/${action}/`)
      updateConversation(conversation.id, res.data)
    } catch (err) {
      console.error("Mute toggle error:", err)
    }
  }

  const customFolderConversationIds = useMemo(() => {
    if (!folderTab.startsWith("custom-")) return null
    const folderId = Number(folderTab.slice("custom-".length))
    const folder = folders.find((f) => f.id === folderId)
    // Folder was deleted (e.g. from another tab/session) — fall back to
    // showing all chats instead of a permanently empty list.
    if (!folder) return null
    return new Set(folder.conversations || [])
  }, [folderTab, folders])

  const filtered = useMemo(() => {
    const term = searchTerm.trim().toLowerCase()

    let list = conversations.filter((c) => {
      // Rendered separately as the pinned "Saved Messages" row.
      if (savedMessagesConversation && c.id === savedMessagesConversation.id) return false

      if (customFolderConversationIds) return customFolderConversationIds.has(c.id)
      if (folderTab === "private") return c.type === "private"
      if (folderTab === "groups") return c.type === "group"
      if (folderTab === "channels") return c.type === "channel"
      if (folderTab === "unread") return (c.unread_count || 0) > 0
      return true
    })

    if (term) {
      list = list.filter((c) => {
        const name = c.type === "group" ? c.name : c.other_participant?.username
        return name?.toLowerCase().includes(term)
      })
    }

    return [...list].sort((a, b) => {
      if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1

      const aTime = new Date(a.last_message?.created_at || a.updated_at).getTime()
      const bTime = new Date(b.last_message?.created_at || b.updated_at).getTime()
      return bTime - aTime
    })
  }, [conversations, folderTab, searchTerm, savedMessagesConversation, customFolderConversationIds])

  const newChatUsers = useMemo(() => {
    const term = searchTerm.trim().toLowerCase()
    if (!term) return []

    const existingPartnerIds = new Set(
      conversations
        .filter((c) => c.type === "private" && c.other_participant)
        .map((c) => c.other_participant.id)
    )

    return (users || []).filter(
      (u) =>
        !existingPartnerIds.has(u.id) &&
        u.username?.toLowerCase().includes(term)
    )
  }, [users, conversations, searchTerm])

  // Message-content search across every conversation — separate from the
  // chat-name filter above, which only matches conversation titles.
  useEffect(() => {
    const term = searchTerm.trim()
    if (term.length < 2) {
      setMessageResults([])
      return
    }
    const timeout = setTimeout(() => {
      api.get("/messages/global-search/", { params: { q: term } })
        .then((res) => setMessageResults(res.data || []))
        .catch((err) => {
          console.error("Global search error:", err)
          setMessageResults([])
        })
    }, 350)
    return () => clearTimeout(timeout)
  }, [searchTerm])

  const handleMessageResultClick = (result) => {
    const conversation = conversations.find((c) => c.id === result.conversation_id)
    const isPrivate = result.conversation_type === "private"
    onSelectChat({
      conversationId: result.conversation_id,
      type: result.conversation_type,
      displayName: conversation
        ? (isPrivate ? conversation.other_participant?.username : conversation.name)
        : result.conversation_name,
      avatarUrl: conversation
        ? (isPrivate ? conversation.other_participant?.avatar_url : conversation.avatar_url)
        : null,
      otherUserId: conversation?.other_participant?.id ?? result.other_user_id ?? null,
      membersCount: conversation?.members_count,
      isMuted: conversation?.is_muted,
      isPinned: conversation?.is_pinned,
      lastSeen: conversation?.other_participant?.last_seen ?? null,
      scrollToMessageId: result.message_id,
    })
  }

  const handleRowClick = (conversation) => {
    const isPrivate = conversation.type === "private"
    onSelectChat({
      conversationId: conversation.id,
      type: conversation.type,
      displayName: isPrivate ? conversation.other_participant?.username : conversation.name,
      avatarUrl: isPrivate ? conversation.other_participant?.avatar_url : conversation.avatar_url,
      otherUserId: conversation.other_participant?.id ?? null,
      membersCount: conversation.members_count,
      isMuted: conversation.is_muted,
      isPinned: conversation.is_pinned,
      lastSeen: conversation.other_participant?.last_seen ?? null,
    })
  }

  const handleSavedMessagesClick = async () => {
    if (savedMessagesConversation) {
      onSelectChat({
        conversationId: savedMessagesConversation.id,
        type: "private",
        displayName: "Saved Messages",
        avatarUrl: null,
        otherUserId: currentUser.id,
        membersCount: 1,
        isMuted: savedMessagesConversation.is_muted,
        isPinned: savedMessagesConversation.is_pinned,
        lastSeen: null,
      })
      return
    }

    try {
      const res = await api.post("/conversations/", {
        type: "private",
        participant_id: currentUser.id,
      })
      upsertConversation(res.data)
      onSelectChat({
        conversationId: res.data.id,
        type: "private",
        displayName: "Saved Messages",
        avatarUrl: null,
        otherUserId: currentUser.id,
        membersCount: 1,
        isMuted: false,
        isPinned: false,
        lastSeen: null,
      })
    } catch (err) {
      console.error("Saved Messages error:", err)
    }
  }

  const handleNewChatClick = (user) => {
    onSelectChat({
      conversationId: null,
      type: "private",
      displayName: user.username,
      avatarUrl: user.avatar_url || user.avatar || null,
      otherUserId: user.id,
      membersCount: null,
      isMuted: false,
      isPinned: false,
      lastSeen: user.last_seen ?? null,
    })
  }

  if (loading) {
    return (
      <div className="loading-container">
        <div className="spinner"></div>
        <span>Loading chats...</span>
      </div>
    )
  }

  const showSavedMessagesRow =
    (folderTab === "all" || folderTab === "private") &&
    "saved messages".includes(searchTerm.trim().toLowerCase())

  return (
    <div className="chats-list-container">
      {showSavedMessagesRow && (
        <SavedMessagesRow
          conversation={savedMessagesConversation}
          isActive={
            !!savedMessagesConversation &&
            selectedConversationId === savedMessagesConversation.id
          }
          onClick={handleSavedMessagesClick}
        />
      )}

      {filtered.length === 0 && newChatUsers.length === 0 && !showSavedMessagesRow && (
        <div className="empty-state">
          {searchTerm ? "No results found" : "No chats yet"}
        </div>
      )}

      {filtered.map((conversation) => (
        <ChatRow
          key={conversation.id}
          conversation={conversation}
          isActive={selectedConversationId === conversation.id}
          isOnline={onlineUsers?.has(Number(conversation.other_participant?.id))}
          onClick={handleRowClick}
          menuOpen={openMenuId === conversation.id}
          onToggleMenu={(id) => setOpenMenuId((prev) => (prev === id ? null : id))}
          onPinToggle={handlePinToggle}
          onMuteToggle={handleMuteToggle}
        />
      ))}

      {newChatUsers.length > 0 && (
        <>
          <div className="chats-list-section-label">New chat</div>
          {newChatUsers.map((user) => (
            <NewChatRow key={user.id} user={user} onClick={handleNewChatClick} />
          ))}
        </>
      )}

      {messageResults.length > 0 && (
        <>
          <div className="chats-list-section-label">Messages</div>
          {messageResults.map((result) => (
            <div
              key={result.message_id}
              className="chat-row"
              onClick={() => handleMessageResultClick(result)}
            >
              <div className="chat-row-avatar">
                <div
                  className="chat-row-avatar-placeholder"
                  style={{ backgroundColor: getAvatarColor(result.conversation_name || "?") }}
                >
                  {(result.conversation_name || "?")[0]?.toUpperCase()}
                </div>
              </div>
              <div className="chat-row-body">
                <div className="chat-row-top">
                  <span className="chat-row-name">{result.conversation_name}</span>
                  <span className="chat-row-time">
                    {formatChatTimestamp(result.created_at)}
                  </span>
                </div>
                <div className="chat-row-bottom">
                  <span className="chat-row-preview">
                    {result.sender_username}: {result.content}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  )
}

export default ChatsList
