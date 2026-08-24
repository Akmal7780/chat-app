import { useState, useEffect, useRef } from "react"
import { createPortal } from "react-dom"
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
  const { onlineUsers, setUsers } = useOnlineUsers();
  const socketRef = useRef(null)
  const reconnectTimeoutRef = useRef(null)
  const [showGroupInfo, setShowGroupInfo] = useState(false)
  const [showChannelInfo, setShowChannelInfo] = useState(false)
  const [showUserInfo, setShowUserInfo] = useState(false)
  const [showSummary, setShowSummary] = useState(false)
  const [summaryText, setSummaryText] = useState("")
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [showAiSearch, setShowAiSearch] = useState(false)
  const [aiSearchQuestion, setAiSearchQuestion] = useState("")
  const [aiSearchAnswer, setAiSearchAnswer] = useState("")
  const [aiSearchLoading, setAiSearchLoading] = useState(false)
  const firstUnreadRef = useRef(null)
  const [search, setSearch] = useState("")
  const [searchResults, setSearchResults] = useState([])
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)
  const [showHeaderMenu, setShowHeaderMenu] = useState(false)
  const [headerMenuPos, setHeaderMenuPos] = useState(null)
  const headerMenuBtnRef = useRef(null)

  const toggleHeaderMenu = () => {
    if (!showHeaderMenu && headerMenuBtnRef.current) {
      const rect = headerMenuBtnRef.current.getBoundingClientRect()
      setHeaderMenuPos({ top: rect.bottom + 6, right: window.innerWidth - rect.right })
    }
    setShowHeaderMenu((prev) => !prev)
  }
  const [groupInfoInitialMode, setGroupInfoInitialMode] = useState("view")
  const [showExportModal, setShowExportModal] = useState(false)
  const [exportIncludePhotos, setExportIncludePhotos] = useState(true)
  const [exportIncludeVideos, setExportIncludeVideos] = useState(true)
  const [exportIncludeVoice, setExportIncludeVoice] = useState(true)
  const [exportIncludeFiles, setExportIncludeFiles] = useState(true)
  const [exportMaxSizeMb, setExportMaxSizeMb] = useState(8)
  const [exportFormat, setExportFormat] = useState("html")
  const [exportDateFrom, setExportDateFrom] = useState("")
  const [exportDateTo, setExportDateTo] = useState("")
  const [exporting, setExporting] = useState(false)
  const [showScheduledModal, setShowScheduledModal] = useState(false)
  const [scheduledMessages, setScheduledMessages] = useState([])
  const [scheduledLoading, setScheduledLoading] = useState(false)
  const [showReportModal, setShowReportModal] = useState(false)
  const [reportReason, setReportReason] = useState("")
  const [reportSubmitting, setReportSubmitting] = useState(false)
  const [showPollModal, setShowPollModal] = useState(false)
  const [pollQuestion, setPollQuestion] = useState("")
  const [pollDescription, setPollDescription] = useState("")
  const [pollOptions, setPollOptions] = useState(["", ""])
  const [pollShowWhoVoted, setPollShowWhoVoted] = useState(true)
  const [pollAllowsMultiple, setPollAllowsMultiple] = useState(false)
  const [pollAllowAddingOptions, setPollAllowAddingOptions] = useState(false)
  const [pollAllowRevoting, setPollAllowRevoting] = useState(true)
  const [pollShuffleOptions, setPollShuffleOptions] = useState(false)
  const [pollQuizMode, setPollQuizMode] = useState(false)
  const [pollCorrectIndices, setPollCorrectIndices] = useState([])
  const [pollDuration, setPollDuration] = useState("")
  const [pollSubmitting, setPollSubmitting] = useState(false)

  const POLL_DURATIONS = [
    { value: "", label: "Off" },
    { value: String(60 * 60), label: "1 hour" },
    { value: String(60 * 60 * 24), label: "1 day" },
    { value: String(60 * 60 * 24 * 3), label: "3 days" },
    { value: String(60 * 60 * 24 * 7), label: "1 week" },
  ]

  const openPollModal = () => {
    setShowHeaderMenu(false)
    setPollQuestion("")
    setPollDescription("")
    setPollOptions(["", ""])
    setPollShowWhoVoted(true)
    setPollAllowsMultiple(false)
    setPollAllowAddingOptions(false)
    setPollAllowRevoting(true)
    setPollShuffleOptions(false)
    setPollQuizMode(false)
    setPollCorrectIndices([])
    setPollDuration("")
    setShowPollModal(true)
  }

  const updatePollOption = (index, value) => {
    setPollOptions((prev) => prev.map((opt, i) => (i === index ? value : opt)))
  }

  const addPollOption = () => {
    setPollOptions((prev) => (prev.length >= 10 ? prev : [...prev, ""]))
  }

  const removePollOption = (index) => {
    setPollOptions((prev) => (prev.length <= 2 ? prev : prev.filter((_, i) => i !== index)))
    setPollCorrectIndices((prev) => prev.filter((i) => i !== index).map((i) => (i > index ? i - 1 : i)))
  }

  const togglePollQuizMode = (checked) => {
    setPollQuizMode(checked)
    if (checked) setPollAllowsMultiple(false)
  }

  const togglePollCorrectOption = (index) => {
    setPollCorrectIndices((prev) =>
      prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index]
    )
  }

  const handleCreatePoll = async () => {
    const question = pollQuestion.trim()
    const cleanedOptions = pollOptions.map((o) => o.trim()).filter(Boolean)
    if (!question) {
      toast.error("Poll question is required")
      return
    }
    if (cleanedOptions.length < 2) {
      toast.error("Add at least 2 options")
      return
    }
    if (pollQuizMode && pollCorrectIndices.length === 0) {
      toast.error("Select the correct answer")
      return
    }
    setPollSubmitting(true)
    try {
      await api.post("/messages/create-poll/", {
        conversation_id: conversation.id,
        question,
        description: pollDescription.trim(),
        options: cleanedOptions,
        allows_multiple: pollQuizMode ? false : pollAllowsMultiple,
        anonymous: !pollShowWhoVoted,
        allow_adding_options: pollAllowAddingOptions,
        allow_revoting: pollAllowRevoting,
        shuffle_options: pollShuffleOptions,
        quiz_mode: pollQuizMode,
        correct_option_indices: pollQuizMode ? pollCorrectIndices : [],
        duration_seconds: pollDuration ? Number(pollDuration) : null,
      })
      setShowPollModal(false)
    } catch (err) {
      console.error("Create poll error:", err)
      const data = err.response?.data
      toast.error((Array.isArray(data) ? data[0] : data?.detail || data?.error) || "Could not create poll")
    } finally {
      setPollSubmitting(false)
    }
  }

  const openGroupInfo = () => {
    setShowHeaderMenu(false)
    setGroupInfoInitialMode("view")
    setShowGroupInfo(true)
  }

  const openManageGroup = () => {
    setShowHeaderMenu(false)
    setGroupInfoInitialMode("edit")
    setShowGroupInfo(true)
  }

  const handleHeaderMute = async () => {
    setShowHeaderMenu(false)
    try {
      const action = conversation.is_muted ? "unmute" : "mute"
      const res = await api.post(`/conversations/${conversation.id}/${action}/`)
      setConversation(res.data)
      updateConversation(res.data.id, res.data)
    } catch (err) {
      console.error("Mute toggle error:", err)
      toast.error("Failed to update mute setting")
    }
  }

  const handleHeaderLeave = async () => {
    setShowHeaderMenu(false)
    if (!window.confirm(`Leave "${conversation.name}"?`)) return
    try {
      await api.post(`/conversations/${conversation.id}/leave/`)
      onBack?.()
    } catch (err) {
      console.error("Leave group error:", err)
      toast.error("Failed to leave group")
    }
  }

  const handleHeaderClearHistory = async () => {
    setShowHeaderMenu(false)
    if (!window.confirm("Clear chat history? This only removes it from your view — other participants keep their copy.")) return
    try {
      await api.post(`/conversations/${conversation.id}/clear-history/`)
      setMessages([])
      toast.success("Chat history cleared")
    } catch (err) {
      console.error("Clear history error:", err)
      toast.error("Failed to clear history")
    }
  }

  const openScheduledModal = () => {
    setShowScheduledModal(true)
    setScheduledLoading(true)
    api.get("/messages/scheduled/", { params: { conversation_id: conversation.id } })
      .then((res) => setScheduledMessages(res.data))
      .catch((err) => console.error("Load scheduled messages error:", err))
      .finally(() => setScheduledLoading(false))
  }

  const cancelScheduledMessage = async (id) => {
    try {
      await api.post(`/messages/${id}/cancel-schedule/`)
      setScheduledMessages((prev) => prev.filter((m) => m.id !== id))
      toast.success("Cancelled")
    } catch (err) {
      console.error("Cancel scheduled message error:", err)
      toast.error("Failed to cancel")
    }
  }

  const sendScheduledNow = async (id) => {
    try {
      await api.post(`/messages/${id}/send-now/`)
      setScheduledMessages((prev) => prev.filter((m) => m.id !== id))
      toast.success("Sent")
    } catch (err) {
      console.error("Send now error:", err)
      toast.error("Failed to send")
    }
  }

  const openReportModal = () => {
    setShowHeaderMenu(false)
    setReportReason("")
    setShowReportModal(true)
  }

  const handleReportSubmit = async () => {
    const reason = reportReason.trim()
    if (!reason) {
      toast.error("Please describe the issue")
      return
    }
    setReportSubmitting(true)
    try {
      await api.post(`/conversations/${conversation.id}/report/`, { reason })
      setShowReportModal(false)
      toast.success("Report submitted")
    } catch (err) {
      console.error("Report error:", err)
      toast.error("Failed to submit report")
    } finally {
      setReportSubmitting(false)
    }
  }

  const openExportModal = () => {
    setShowHeaderMenu(false)
    setExportIncludePhotos(true)
    setExportIncludeVideos(true)
    setExportIncludeVoice(true)
    setExportIncludeFiles(true)
    setExportMaxSizeMb(8)
    setExportFormat("html")
    setExportDateFrom("")
    setExportDateTo("")
    setShowExportModal(true)
  }

  const handleExportSubmit = async () => {
    setExporting(true)
    try {
      const res = await api.get("/messages/export/", {
        params: {
          conversation_id: conversation.id,
          export_format: exportFormat,
          include_photos: exportIncludePhotos,
          include_videos: exportIncludeVideos,
          include_voice: exportIncludeVoice,
          include_files: exportIncludeFiles,
          max_size_mb: exportMaxSizeMb,
          date_from: exportDateFrom || undefined,
          date_to: exportDateTo || undefined,
        },
        responseType: "blob",
      })
      const disposition = res.headers["content-disposition"] || ""
      const match = disposition.match(/filename="?([^"]+)"?/)
      const fallbackExt = exportFormat === "html" ? "zip" : "txt"
      const filename = match ? match[1] : `${conversation.name || "chat"}_export.${fallbackExt}`
      const url = window.URL.createObjectURL(res.data)
      const link = document.createElement("a")
      link.href = url
      link.download = filename
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
      setShowExportModal(false)
    } catch (err) {
      console.error("Export chat history error:", err)
      toast.error("Failed to export chat history")
    } finally {
      setExporting(false)
    }
  }

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
  const { conversations, updateConversation, upsertConversation, subscribePresence } = useChats()
  const { openCallPrompt } = useCall()

  const conversationRef = useRef(null)

useEffect(() => {
  conversationRef.current = conversation
}, [conversation])

// Presence now arrives over the always-on notifications socket (see
// ChatsContext), not this per-conversation one — refresh the open DM's
// "last seen" text and the global users list when the other side drops.
useEffect(() => {
  return subscribePresence((event) => {
    if (event.type !== "user_offline") return

    if (Number(selectedUser?.otherUserId) === Number(event.user_id)) {
      onSelectUser({ ...selectedUser, lastSeen: event.last_seen })
    }

    setUsers(prev =>
      prev.map(u =>
        String(u.id) === String(event.user_id)
          ? { ...u, last_seen: event.last_seen }
          : u
      )
    )
  })
}, [subscribePresence, selectedUser, onSelectUser, setUsers])

useEffect(() => {
  if (!socketRef.current || !conversation) return

  if (socketRef.current.readyState === WebSocket.OPEN) {
    socketRef.current.send(JSON.stringify({
      type: "active_chat",
      conversation_id: conversation.id
    }))
  }
}, [conversation])

// Jump-to-message from global search — waits for that specific message to
// actually be in the loaded list (a fresh chat-open fetch is async) before
// scrolling, and only fires once per requested id so it doesn't re-trigger
// on every later message-list update.
const scrolledToSearchResultRef = useRef(null)
useEffect(() => {
  const targetId = selectedUser?.scrollToMessageId
  if (!targetId || scrolledToSearchResultRef.current === targetId) return
  if (!messages.some(m => m.id === targetId)) return

  scrolledToSearchResultRef.current = targetId
  setTimeout(() => {
    const el = document.getElementById(`message-${targetId}`)
    if (!el) return
    el.scrollIntoView({ behavior: "smooth", block: "center" })
    el.classList.add("highlight-message")
    setTimeout(() => el.classList.remove("highlight-message"), 2000)
  }, 100)
}, [selectedUser?.scrollToMessageId, messages])

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

        // Whole conversation marked read at once (opening a chat with many
        // unread messages goes through the REST bulk mark_read, not the
        // per-message scroll-into-view "read" event above).
        else if (data.type === "messages_read_bulk") {
          const readIds = new Set(data.message_ids)
          setMessages(prev =>
            prev.map(msg =>
              readIds.has(msg.id) ? { ...msg, status: "read" } : msg
            )
          )
        }

        // Presence (online_users_list / user_online / user_offline) is no
        // longer sent over this per-conversation socket — it now arrives
        // exclusively over the always-on notifications socket, handled in
        // ChatsContext and consumed below via subscribePresence().
        
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

// 📊 POLL VOTE UPDATE
else if (data.type === "poll_updated") {
  setMessages(prev =>
    prev.map(msg =>
      Number(msg.id) === Number(data.message_id)
        ? { ...msg, poll: data.poll }
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

  const handleAiSearch = async () => {
    const question = aiSearchQuestion.trim()
    if (!question || aiSearchLoading) return

    setAiSearchLoading(true)
    setAiSearchAnswer("")

    try {
      const contents = messages
        .filter((m) => !m.is_deleted && m.content?.trim())
        .slice(-200)
        .map((m) => `${m.sender_username || m.sender}: ${m.content}`)

      if (contents.length === 0) {
        setAiSearchAnswer("Not enough messages to search yet.")
        return
      }

      const res = await api.post("/ai/search/", { messages: contents, question })
      setAiSearchAnswer(res.data.answer)
    } catch (err) {
      console.error("AI search error:", err)
      setAiSearchAnswer("Failed to search. Please try again.")
    } finally {
      setAiSearchLoading(false)
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

  {/* Ask AI about this chat */}
  <button
    className="summarize-btn"
    onClick={() => setShowAiSearch(true)}
    title="Ask AI about this chat"
  >
    🧠
  </button>

  {/* Scheduled messages for this conversation */}
  {selectedUser && !isSavedMessages && (
    <button
      className="summarize-btn"
      onClick={openScheduledModal}
      title="Scheduled messages"
    >
      🕒
    </button>
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

  {/* Header kebab menu (group/channel only) */}
  {selectedUser && (selectedUser.type === "group" || selectedUser.type === "channel") && (
    <div className="chat-header-menu-wrapper">
      <button
        ref={headerMenuBtnRef}
        className="summarize-btn"
        onClick={toggleHeaderMenu}
        title="More"
      >
        ⋮
      </button>
      {showHeaderMenu && headerMenuPos && createPortal(
        <>
          <div className="chat-header-menu-backdrop" onClick={() => setShowHeaderMenu(false)} />
          <div className="chat-header-menu" style={{ top: headerMenuPos.top, right: headerMenuPos.right }}>
            <button onClick={handleHeaderMute}>
              <span>{conversation?.is_muted ? "🔔" : "🔕"}</span>
              {conversation?.is_muted ? "Unmute notifications" : "Mute notifications"}
            </button>
            <button
              onClick={() => {
                setShowHeaderMenu(false)
                if (selectedUser.type === "group") openGroupInfo()
                else setShowChannelInfo(true)
              }}
            >
              <span>ℹ️</span> View {selectedUser.type === "group" ? "group" : "channel"} info
            </button>
            {selectedUser.type === "group" ? (
              <button onClick={openManageGroup}>
                <span>⚙️</span> Manage group
              </button>
            ) : (
              <button
                onClick={() => {
                  setShowHeaderMenu(false)
                  setShowChannelInfo(true)
                }}
              >
                <span>⚙️</span> Manage channel
              </button>
            )}
            <button onClick={openPollModal}>
              <span>📊</span> Create poll
            </button>
            <button onClick={openExportModal}>
              <span>📤</span> Export chat history
            </button>
            <button onClick={openReportModal}>
              <span>⚠️</span> Report
            </button>
            <button onClick={handleHeaderClearHistory}>
              <span>🧹</span> Clear history
            </button>
            <button className="danger" onClick={handleHeaderLeave}>
              <span>🚪</span> Leave {selectedUser.type === "group" ? "group" : "channel"}
            </button>
          </div>
        </>,
        document.body
      )}
    </div>
  )}

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
      initialMode={groupInfoInitialMode}
      onClose={() => { setShowGroupInfo(false); setGroupInfoInitialMode("view") }}
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

  {showAiSearch && (
    <div
      className="summary-modal-overlay"
      onClick={() => { setShowAiSearch(false); setAiSearchQuestion(""); setAiSearchAnswer("") }}
    >
      <div className="summary-modal" onClick={(e) => e.stopPropagation()}>
        <div className="summary-modal-header">
          <h3>🧠 Ask AI</h3>
          <button onClick={() => { setShowAiSearch(false); setAiSearchQuestion(""); setAiSearchAnswer("") }}>×</button>
        </div>
        <div className="summary-modal-body">
          <div className="ai-search-input-row">
            <input
              type="text"
              className="ai-search-input"
              placeholder="Ask something about this chat…"
              value={aiSearchQuestion}
              onChange={(e) => setAiSearchQuestion(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAiSearch()}
              autoFocus
            />
            <button
              className="ai-search-submit"
              onClick={handleAiSearch}
              disabled={aiSearchLoading || !aiSearchQuestion.trim()}
            >
              {aiSearchLoading ? "…" : "Ask"}
            </button>
          </div>
          {aiSearchLoading ? (
            <div className="summary-loading">Searching…</div>
          ) : aiSearchAnswer ? (
            <p>{aiSearchAnswer}</p>
          ) : null}
        </div>
      </div>
    </div>
  )}

  {showPollModal && createPortal(
    <div className="poll-modal-overlay" onClick={() => setShowPollModal(false)}>
      <div className="poll-modal" onClick={(e) => e.stopPropagation()}>
        <div className="poll-modal-header">
          <h3>New poll</h3>
          <button onClick={() => setShowPollModal(false)}>×</button>
        </div>

        <div className="poll-modal-body">
          <div className="poll-section-label">Question</div>
          <input
            type="text"
            className="poll-question-input"
            placeholder="Ask a question…"
            value={pollQuestion}
            onChange={(e) => setPollQuestion(e.target.value)}
            autoFocus
          />
          <input
            type="text"
            className="poll-description-input"
            placeholder="Add Description (optional)"
            value={pollDescription}
            onChange={(e) => setPollDescription(e.target.value.slice(0, 500))}
          />

          <div className="poll-section-label">Poll options</div>
          <div className="poll-options-list">
            {pollOptions.map((option, index) => (
              <div key={index} className="poll-option-row">
                {pollQuizMode && (
                  <input
                    type="checkbox"
                    className="poll-option-correct-check"
                    checked={pollCorrectIndices.includes(index)}
                    onChange={() => togglePollCorrectOption(index)}
                    title="Mark as correct answer"
                  />
                )}
                <input
                  type="text"
                  placeholder={`Option ${index + 1}`}
                  value={option}
                  onChange={(e) => updatePollOption(index, e.target.value)}
                />
                {pollOptions.length > 2 && (
                  <button
                    type="button"
                    className="poll-option-remove"
                    onClick={() => removePollOption(index)}
                    title="Remove option"
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
          </div>

          {pollOptions.length < 10 ? (
            <button type="button" className="poll-add-option" onClick={addPollOption}>
              + Add an option
            </button>
          ) : (
            <div className="poll-options-hint">Maximum 10 options</div>
          )}

          <div className="poll-section-label">Settings</div>
          <div className="poll-settings-list">
            <label className="poll-setting-row">
              <span className="poll-setting-icon" style={{ background: "#3b82f6" }}>👁️</span>
              <span className="poll-setting-text">
                <span className="poll-setting-title">Show Who Voted</span>
                <span className="poll-setting-desc">Display voter name on each option.</span>
              </span>
              <input
                type="checkbox"
                className="poll-toggle"
                checked={pollShowWhoVoted}
                onChange={(e) => setPollShowWhoVoted(e.target.checked)}
              />
            </label>

            <label className="poll-setting-row">
              <span className="poll-setting-icon" style={{ background: "#f59e0b" }}>🔀</span>
              <span className="poll-setting-text">
                <span className="poll-setting-title">Allow Multiple Answers</span>
                <span className="poll-setting-desc">Voters can select more than one option.</span>
              </span>
              <input
                type="checkbox"
                className="poll-toggle"
                checked={pollAllowsMultiple}
                disabled={pollQuizMode}
                onChange={(e) => setPollAllowsMultiple(e.target.checked)}
              />
            </label>

            <label className="poll-setting-row">
              <span className="poll-setting-icon" style={{ background: "#6366f1" }}>➕</span>
              <span className="poll-setting-text">
                <span className="poll-setting-title">Allow Adding Options</span>
                <span className="poll-setting-desc">Participants can suggest new options.</span>
              </span>
              <input
                type="checkbox"
                className="poll-toggle"
                checked={pollAllowAddingOptions}
                onChange={(e) => setPollAllowAddingOptions(e.target.checked)}
              />
            </label>

            <label className="poll-setting-row">
              <span className="poll-setting-icon" style={{ background: "#a855f7" }}>🔁</span>
              <span className="poll-setting-text">
                <span className="poll-setting-title">Allow Revoting</span>
                <span className="poll-setting-desc">Voters can change their vote.</span>
              </span>
              <input
                type="checkbox"
                className="poll-toggle"
                checked={pollAllowRevoting}
                onChange={(e) => setPollAllowRevoting(e.target.checked)}
              />
            </label>

            <label className="poll-setting-row">
              <span className="poll-setting-icon" style={{ background: "#f97316" }}>🔀</span>
              <span className="poll-setting-text">
                <span className="poll-setting-title">Shuffle Options</span>
                <span className="poll-setting-desc">Answers appear in random order for each viewer.</span>
              </span>
              <input
                type="checkbox"
                className="poll-toggle"
                checked={pollShuffleOptions}
                onChange={(e) => setPollShuffleOptions(e.target.checked)}
              />
            </label>

            <label className="poll-setting-row">
              <span className="poll-setting-icon" style={{ background: "#22c55e" }}>✅</span>
              <span className="poll-setting-text">
                <span className="poll-setting-title">Set Correct Answer</span>
                <span className="poll-setting-desc">Mark one or more options as the right answer.</span>
              </span>
              <input
                type="checkbox"
                className="poll-toggle"
                checked={pollQuizMode}
                onChange={(e) => togglePollQuizMode(e.target.checked)}
              />
            </label>

            <div className="poll-setting-row poll-setting-row-static">
              <span className="poll-setting-icon" style={{ background: "#ef4444" }}>⏱️</span>
              <span className="poll-setting-text">
                <span className="poll-setting-title">Limit Duration</span>
                <span className="poll-setting-desc">Automatically close the poll at a set time.</span>
              </span>
              <select
                className="poll-duration-select"
                value={pollDuration}
                onChange={(e) => setPollDuration(e.target.value)}
              >
                {POLL_DURATIONS.map((d) => (
                  <option key={d.value} value={d.value}>{d.label}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="poll-modal-footer">
          <button type="button" className="poll-cancel-btn" onClick={() => setShowPollModal(false)}>
            Cancel
          </button>
          <button
            type="button"
            className="poll-submit-btn"
            onClick={handleCreatePoll}
            disabled={pollSubmitting}
          >
            {pollSubmitting ? "Creating…" : "Create"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )}

  {showExportModal && createPortal(
    <div className="poll-modal-overlay" onClick={() => setShowExportModal(false)}>
      <div className="poll-modal" onClick={(e) => e.stopPropagation()}>
        <div className="poll-modal-header">
          <h3>Chat export settings</h3>
          <button onClick={() => setShowExportModal(false)}>×</button>
        </div>

        <div className="poll-modal-body">
          <div className="export-checkbox-list">
            <label className="export-checkbox-row">
              <input type="checkbox" checked={exportIncludePhotos} onChange={(e) => setExportIncludePhotos(e.target.checked)} />
              Photos
            </label>
            <label className="export-checkbox-row">
              <input type="checkbox" checked={exportIncludeVideos} onChange={(e) => setExportIncludeVideos(e.target.checked)} />
              Videos
            </label>
            <label className="export-checkbox-row">
              <input type="checkbox" checked={exportIncludeVoice} onChange={(e) => setExportIncludeVoice(e.target.checked)} />
              Voice messages
            </label>
            <label className="export-checkbox-row">
              <input type="checkbox" checked={exportIncludeFiles} onChange={(e) => setExportIncludeFiles(e.target.checked)} />
              Files
            </label>
          </div>

          <div className="export-size-row">
            <span>Size limit</span>
            <span className="export-size-value">{exportMaxSizeMb} MB</span>
          </div>
          <input
            type="range"
            min="1"
            max="50"
            value={exportMaxSizeMb}
            onChange={(e) => setExportMaxSizeMb(Number(e.target.value))}
            className="export-size-slider"
          />

          <div className="export-field-row">
            <span>Format</span>
            <select value={exportFormat} onChange={(e) => setExportFormat(e.target.value)} className="poll-duration-select">
              <option value="html">HTML</option>
              <option value="txt">Plain text</option>
            </select>
          </div>

          <div className="export-field-row">
            <span>From</span>
            <input
              type="date"
              value={exportDateFrom}
              onChange={(e) => setExportDateFrom(e.target.value)}
              className="poll-duration-select"
            />
          </div>
          <div className="export-field-row">
            <span>To</span>
            <input
              type="date"
              value={exportDateTo}
              onChange={(e) => setExportDateTo(e.target.value)}
              className="poll-duration-select"
            />
          </div>

          <div className="export-hint">The file downloads to your browser's default downloads location.</div>
        </div>

        <div className="poll-modal-footer">
          <button type="button" className="poll-cancel-btn" onClick={() => setShowExportModal(false)}>
            Cancel
          </button>
          <button type="button" className="poll-submit-btn" onClick={handleExportSubmit} disabled={exporting}>
            {exporting ? "Exporting…" : "Export"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )}

  {showReportModal && createPortal(
    <div className="poll-modal-overlay" onClick={() => setShowReportModal(false)}>
      <div className="poll-modal" onClick={(e) => e.stopPropagation()}>
        <div className="poll-modal-header">
          <h3>⚠️ Report {selectedUser?.type === "group" ? "group" : "channel"}</h3>
          <button onClick={() => setShowReportModal(false)}>×</button>
        </div>

        <div className="poll-modal-body">
          <div className="export-hint">Tell us what's wrong. This is sent to Nexus Chat moderators for review.</div>
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
          <button type="button" className="poll-cancel-btn" onClick={() => setShowReportModal(false)}>
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

  {showScheduledModal && createPortal(
    <div className="poll-modal-overlay" onClick={() => setShowScheduledModal(false)}>
      <div className="poll-modal" onClick={(e) => e.stopPropagation()}>
        <div className="poll-modal-header">
          <h3>🕒 Scheduled messages</h3>
          <button onClick={() => setShowScheduledModal(false)}>×</button>
        </div>

        <div className="poll-modal-body">
          {scheduledLoading ? (
            <div className="export-hint">Loading…</div>
          ) : scheduledMessages.length === 0 ? (
            <div className="export-hint">No scheduled messages in this chat</div>
          ) : (
            scheduledMessages.map((m) => (
              <div key={m.id} className="scheduled-message-card">
                <div className="scheduled-message-content">{m.content}</div>
                <div className="scheduled-message-meta">
                  For {new Date(m.scheduled_at).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                </div>
                <div className="scheduled-message-actions">
                  <button onClick={() => sendScheduledNow(m.id)}>Send now</button>
                  <button className="danger" onClick={() => cancelScheduledMessage(m.id)}>Cancel</button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>,
    document.body
  )}

</div>
  )
}

export default ChatContainer