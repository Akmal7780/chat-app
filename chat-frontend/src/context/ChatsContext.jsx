import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react"
import toast from "react-hot-toast"
import api from "../api/axios"
import { getNotificationPrefs } from "../utils/notificationPrefs"
import { showDesktopNotification, playNotificationSound, flashTitle } from "../utils/notify"
import { useOnlineUsers } from "./OnlineUsersContext"

const ChatsContext = createContext()

const CALL_SIGNAL_TYPES = new Set([
  "incoming_call",
  "call_answered",
  "call_ice_candidate",
  "call_ended",
])

export const ChatsProvider = ({ children, currentUser, onNotificationClick }) => {
  const [conversations, setConversations] = useState([])
  const [loading, setLoading] = useState(true)
  const [folders, setFolders] = useState([])
  const { setOnlineUsers } = useOnlineUsers()
  const notificationSocketRef = useRef(null)
  const notificationCountRef = useRef({})
  const conversationsRef = useRef([])
  const callSignalListenersRef = useRef(new Set())
  const presenceListenersRef = useRef(new Set())

  const subscribeCallSignals = useCallback((listener) => {
    callSignalListenersRef.current.add(listener)
    return () => callSignalListenersRef.current.delete(listener)
  }, [])

  // Lets a component (e.g. ChatContainer, to refresh a DM header's
  // "last seen X ago" text) react to presence events without owning a
  // websocket itself — the single notifications socket below is the only
  // one that ever receives them now.
  const subscribePresence = useCallback((listener) => {
    presenceListenersRef.current.add(listener)
    return () => presenceListenersRef.current.delete(listener)
  }, [])

  useEffect(() => {
    conversationsRef.current = conversations
  }, [conversations])

  const refreshConversations = useCallback(async () => {
    try {
      const res = await api.get("/conversations/")
      const data = res.data.results || res.data
      setConversations(Array.isArray(data) ? data : [])
    } catch (error) {
      console.error("Conversations fetch error:", error)
    } finally {
      setLoading(false)
    }
  }, [])

  const refreshFolders = useCallback(async () => {
    try {
      const res = await api.get("/folders/")
      const data = res.data.results || res.data
      setFolders(Array.isArray(data) ? data : [])
    } catch (error) {
      console.error("Folders fetch error:", error)
    }
  }, [])

  const createFolder = useCallback(async (name, conversationIds) => {
    const res = await api.post("/folders/", {
      name,
      conversation_ids: conversationIds,
    })
    setFolders(prev => [...prev, res.data])
    return res.data
  }, [])

  const deleteFolder = useCallback(async (folderId) => {
    await api.delete(`/folders/${folderId}/`)
    setFolders(prev => prev.filter(f => f.id !== folderId))
  }, [])

  const toggleConversationInFolder = useCallback(async (folderId, conversationId) => {
    const folder = folders.find(f => f.id === folderId)
    if (!folder) return

    const alreadyIn = folder.conversations.includes(conversationId)
    const nextIds = alreadyIn
      ? folder.conversations.filter(id => id !== conversationId)
      : [...folder.conversations, conversationId]

    const res = await api.patch(`/folders/${folderId}/`, { conversation_ids: nextIds })
    setFolders(prev => prev.map(f => (f.id === folderId ? res.data : f)))
    return res.data
  }, [folders])

  const sendCallSignal = useCallback((payload) => {
    const ws = notificationSocketRef.current
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload))
    }
  }, [])

  const updateConversation = useCallback((conversationId, patch) => {
    setConversations(prev => {
      const exists = prev.some(c => c.id === conversationId)
      if (!exists) return prev

      return prev.map(c =>
        c.id === conversationId
          ? { ...c, ...(typeof patch === "function" ? patch(c) : patch) }
          : c
      )
    })
  }, [])

  const upsertConversation = useCallback((conversation) => {
    setConversations(prev => {
      const exists = prev.some(c => c.id === conversation.id)
      if (exists) {
        return prev.map(c => (c.id === conversation.id ? { ...c, ...conversation } : c))
      }
      return [conversation, ...prev]
    })
  }, [])

  useEffect(() => {
    if (currentUser) {
      refreshConversations()
      refreshFolders()
    }
  }, [currentUser, refreshConversations, refreshFolders])

  // 🔔 Single persistent notification socket for the whole /chat session
  useEffect(() => {
    const token = localStorage.getItem("token")
    if (!token || !currentUser) return

    const ws = new WebSocket(`${import.meta.env.VITE_WS_URL}/ws/notifications/?token=${token}`)
    notificationSocketRef.current = ws

    ws.onopen = () => console.log("🔔 Notification connected")

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data)

      if (CALL_SIGNAL_TYPES.has(data.type)) {
        callSignalListenersRef.current.forEach((listener) => listener(data))
        return
      }

      // Presence — this socket connects the moment the app opens (not per
      // conversation), so online status now tracks "is the app open" like
      // Telegram, instead of "is this specific chat open".
      if (data.type === "online_users_list") {
        setOnlineUsers(new Set(data.users.map(Number)))
        return
      }
      if (data.type === "user_online") {
        setOnlineUsers((prev) => new Set([...prev, Number(data.user_id)]))
        presenceListenersRef.current.forEach((listener) => listener(data))
        return
      }
      if (data.type === "user_offline") {
        setOnlineUsers((prev) => {
          const updated = new Set(prev)
          updated.delete(Number(data.user_id))
          return updated
        })
        presenceListenersRef.current.forEach((listener) => listener(data))
        return
      }

      if (data.type !== "notification") return

      const conversationId = Number(data.conversation_id)

      setConversations(prev => {
        const exists = prev.some(c => c.id === conversationId)
        if (!exists) {
          // Unknown conversation locally (e.g. brand new chat) — refetch to pick it up.
          refreshConversations()
          return prev
        }

        return prev.map(c =>
          c.id === conversationId
            ? {
                ...c,
                unread_count: (c.unread_count || 0) + 1,
                last_message: {
                  id: data.message_id,
                  content: data.text,
                  sender_id: data.sender_id,
                  sender_username: data.sender,
                  created_at: new Date().toISOString(),
                  message_type: data.message_type || data.notification_type,
                  is_deleted: false,
                  call_status: data.call_status,
                  call_is_video: data.call_is_video,
                },
              }
            : c
        )
      })

      const buildSelectedChat = () => {
        const conv = conversationsRef.current.find(c => c.id === conversationId)
        if (conv) {
          const isGroup = conv.type === "group"
          return {
            conversationId: conv.id,
            type: conv.type,
            displayName: isGroup ? conv.name : conv.other_participant?.username,
            avatarUrl: isGroup ? null : conv.other_participant?.avatar_url,
            otherUserId: conv.other_participant?.id ?? null,
            membersCount: conv.members_count,
            isMuted: conv.is_muted,
            isPinned: conv.is_pinned,
            lastSeen: conv.other_participant?.last_seen ?? null,
          }
        }
        return {
          conversationId,
          type: data.conversation_type || "private",
          displayName: data.sender,
          avatarUrl: null,
          otherUserId: data.sender_id ?? null,
          membersCount: null,
          isMuted: false,
          isPinned: false,
          lastSeen: null,
        }
      }

      const conv = conversationsRef.current.find(c => c.id === conversationId)
      const convType = conv?.type || data.conversation_type || "private"
      const prefs = getNotificationPrefs()
      const categoryEnabled = convType === "group" ? prefs.notifyGroups : prefs.notifyPrivate
      // A direct @mention alerts even in a muted chat — matches Telegram's
      // real behavior (mute silences the general stream, not a direct call-out).
      const shouldAlert = data.is_mention || (!conv?.is_muted && categoryEnabled)

      if (!shouldAlert) return

      if (prefs.soundEnabled) playNotificationSound(prefs.volume)
      if (prefs.desktopEnabled) showDesktopNotification(data.sender, data.text)
      if (prefs.flashTitleEnabled) flashTitle(`💬 ${data.sender}`)

      const key = `${data.sender}_${data.conversation_id}`
      notificationCountRef.current[key] = (notificationCountRef.current[key] || 0) + 1
      const count = notificationCountRef.current[key]

      toast.success(
        <div
          style={{ display: "flex", flexDirection: "column", cursor: "pointer" }}
          onClick={() => {
            onNotificationClick?.(buildSelectedChat())
            toast.dismiss(key)
          }}
        >
          <span style={{ fontWeight: "bold" }}>
            {data.sender}
            {count > 1 && (
              <span
                style={{
                  marginLeft: "6px",
                  background: "#ef4444",
                  color: "white",
                  borderRadius: "10px",
                  padding: "1px 7px",
                  fontSize: "12px",
                }}
              >
                {count}
              </span>
            )}
          </span>
          <span>{data.text}</span>
        </div>,
        { id: key, duration: 4000 }
      )
    }

    ws.onclose = () => console.log("🔌 Notification closed")

    return () => ws.close()
  }, [currentUser, refreshConversations, onNotificationClick])

  return (
    <ChatsContext.Provider
      value={{
        conversations,
        loading,
        setConversations,
        refreshConversations,
        updateConversation,
        upsertConversation,
        folders,
        refreshFolders,
        createFolder,
        deleteFolder,
        toggleConversationInFolder,
        sendCallSignal,
        subscribeCallSignals,
        subscribePresence,
      }}
    >
      {children}
    </ChatsContext.Provider>
  )
}

export const useChats = () => useContext(ChatsContext)
