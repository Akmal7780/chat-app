import { useState, useEffect, useCallback } from "react"
import { useNavigate } from "react-router-dom"
import toast from "react-hot-toast"
import ChatsList from "../components/chat/ChatsList"
import SidebarHeader, { useFolderTab } from "../components/chat/SidebarHeader"
import FolderRail from "../components/chat/FolderRail"
import { ChatsProvider } from "../context/ChatsContext"
import { ConnectedCallProvider } from "../context/CallContext"
import CallModal from "../components/modals/CallModal"
import ChatContainer from "../components/chat/ChatContainer"
import api from "../api/axios";
import ProfileEdit from "../components/settings/ProfileEdit"
import SettingsModal from "../components/settings/SettingsModal"
import CreateGroupModal from "../components/modals/CreateGroupModal";
import CreateChannelModal from "../components/modals/CreateChannelModal"
import ContactsModal from "../components/modals/ContactsModal"
import PublicChannelsModal from "../components/modals/PublicChannelsModal"
import CallsListModal from "../components/modals/CallsListModal"
import ModerationPanel from "../components/moderation/ModerationPanel"
import { getTheme, applyTheme, isDarkFamily } from "../utils/theme"
import { useLanguage } from "../utils/i18n"
import "../styles/chat.css"

function Chat() {
  const [selectedUser, setSelectedUser] = useState(null)
  const [currentUser, setCurrentUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [initialLoad, setInitialLoad] = useState(true)
  // The chat list is the default/main view on mobile widths (no chat open
  // yet), so it should already be visible without needing an extra tap.
  const [isSidebarOpen, setIsSidebarOpen] = useState(true)
  const [showEdit, setShowEdit] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showMenu, setShowMenu] = useState(false)
  const [showGroupModal, setShowGroupModal] = useState(false)
  const [showContacts, setShowContacts] = useState(false)
  const [showPublicChannels, setShowPublicChannels] = useState(false)
  const [showCalls, setShowCalls] = useState(false)
  const [showModeration, setShowModeration] = useState(false)
  const [settingsInitialView, setSettingsInitialView] = useState("main")
  const [showChannelModal, setShowChannelModal] = useState(false)
  const [users, setUsers] = useState([])
  const [darkMode, setDarkMode] = useState(() => isDarkFamily(getTheme()))
  const [searchTerm, setSearchTerm] = useState("")
  const [folderTab, setFolderTab] = useFolderTab()
  const { t } = useLanguage()

  const toggleDarkMode = () => {
    const next = !darkMode
    setDarkMode(next)
    applyTheme(next ? "dark" : "light")
  }

  // Stable reference — ChatsProvider's notification-socket effect depends
  // on this prop, so a new function identity on every render (an inline
  // arrow here) was tearing down and reconnecting that websocket on every
  // single re-render of this page, which made presence/online-status
  // updates flaky (missed broadcasts during the constant reconnect churn).
  const handleNotificationClick = useCallback((chat) => {
    setSelectedUser(chat)
    setIsSidebarOpen(false)
  }, [])

  const navigate = useNavigate()

  // Close the account/kebab dropdown (.settings-menu) when clicking
  // anywhere outside it — it previously only closed via each menu item's
  // own onClick, so clicking elsewhere on the page left it stuck open.
  useEffect(() => {
    if (!showMenu) return

    const handleClickOutside = (e) => {
      if (!e.target.closest(".settings-menu, .sidebar-menu-btn, .folder-rail-menu-btn")) {
        setShowMenu(false)
      }
    }

    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [showMenu])

  useEffect(() => {
  const fetchUsers = async () => {
    try {
      const res = await api.get("/users/users_list/")
      const data = res.data.results || res.data

      const otherUsers = data.filter(
        (user) => user.id !== currentUser?.id
      )

      setUsers(otherUsers)
    } catch (err) {
      console.log("Users fetch error:", err)
    }
  }

  if (currentUser) {
    fetchUsers()
  }
}, [currentUser])

  useEffect(() => {
    const loadUser = () => {
      try {
        const token = localStorage.getItem("token")

        if (!token) {
          navigate("/")
          return
        }

        const userStr = localStorage.getItem("user")

        if (userStr) {
          const user = JSON.parse(userStr)
          setCurrentUser(user)
        } else {
          localStorage.clear()
          navigate("/")
        }
      } catch (error) {
        localStorage.clear()
        navigate("/")
      } finally {
        setLoading(false)
        setTimeout(() => setInitialLoad(false), 800)
      }
    }

    loadUser()
  }, [navigate])

  // Avatar URLs are presigned S3 links that expire after ~1 hour — the
  // cached copy in localStorage goes stale on long-running sessions, so
  // refresh it from the server once on mount (independent of the fast
  // localStorage-based paint above).
  useEffect(() => {
    if (!currentUser) return

    api.get("/users/users/me/")
      .then((res) => {
        setCurrentUser(res.data)
        localStorage.setItem("user", JSON.stringify(res.data))
      })
      .catch((err) => console.log("Current user refresh error:", err))
  }, [currentUser?.id])

  const handleLogout = () => {
    // Best-effort — revokes this device's session server-side so it no
    // longer shows as active/usable, but we log out locally either way.
    api.post("/users/logout/").catch(() => {})
    localStorage.clear()
    navigate("/")
  }

  const openSavedMessages = async () => {
    setShowMenu(false)
    try {
      const res = await api.post("/conversations/", {
        type: "private",
        participant_id: currentUser.id,
      })
      setSelectedUser({
        conversationId: res.data.id,
        type: "private",
        displayName: "Saved Messages",
        avatarUrl: null,
        otherUserId: currentUser.id,
        membersCount: 1,
        isMuted: res.data.is_muted,
        isPinned: res.data.is_pinned,
        lastSeen: null,
      })
      setIsSidebarOpen(false)
    } catch (err) {
      console.error("Saved Messages error:", err)
    }
  }

  const handleCreateGroup = () => {
  setShowGroupModal(true)
  setShowMenu(false)
}

  const handleSelectContact = (user) => {
    setSelectedUser({
      conversationId: null,
      type: "private",
      displayName: user.full_name || "Unknown",
      avatarUrl: user.avatar_url || user.avatar || null,
      otherUserId: user.id,
      membersCount: null,
      isMuted: false,
      isPinned: false,
      lastSeen: user.last_seen ?? null,
    })
    setShowContacts(false)
    setIsSidebarOpen(false)
  }

  if (loading || initialLoad) {
    return (
      <div className="loading-page">
        <div className="spinner-pulse"></div>
        <p>Loading chat application...</p>
        {currentUser && (
          <div className="welcome-message">
            Welcome back, {currentUser.full_name || "Unknown"}!
          </div>
        )}
      </div>
    )
  }

  if (!currentUser) {
    return (
      <div className="error-container">
        <p>User not found. Please login again.</p>
        <button onClick={() => navigate("/")} className="retry-btn">
          Go to Login
        </button>
      </div>
    )
  }
  const hasAvatar =
  currentUser?.avatar_url &&
  currentUser.avatar_url.trim() !== ""

  return (
    <ChatsProvider
      currentUser={currentUser}
      onNotificationClick={handleNotificationClick}
    >
    <ConnectedCallProvider currentUser={currentUser}>
    <CallModal />
    <div className="chat-main">

      {/* FOLDER RAIL (wide layout only — CSS media query) */}
      <FolderRail
        folderTab={folderTab}
        onFolderChange={setFolderTab}
        onOpenMenu={() => setShowMenu(!showMenu)}
        onOpenFolders={() => { setSettingsInitialView("folders"); setShowSettings(true) }}
      />

      {/* SIDEBAR */}
      <div className={`chat-sidebar ${isSidebarOpen ? 'open' : ''}`}>
        
        {/* 👤 USER INFO (CLICKABLE) */}
        <div className="user-info">
          <div
            className="user-info-row"
            onClick={() => { setSettingsInitialView("main"); setShowSettings(true) }}
            style={{ cursor: "pointer" }}
          >
            

<div className="user-avatar">
  {hasAvatar ? (
    <img src={currentUser.avatar_url} alt="avatar" />
  ) : (
    <span>
      {(currentUser?.full_name || "Unknown")[0].toUpperCase()}
    </span>
  )}
</div>

            <div className="user-details">
              <h3>{currentUser?.full_name || "Unknown"}</h3>
              <small>{currentUser?.email}</small>
            </div>
          </div>
           <div
    className="settings-icon"
    onClick={(e) => {
      e.stopPropagation()
      setShowMenu(!showMenu)
    }}
  >
    ⋮
  </div>
        </div>

        {showMenu && (
          <div className="settings-menu">
            <div className="settings-menu-profile">
              <div className="settings-menu-avatar">
                {hasAvatar ? (
                  <img src={currentUser.avatar_url} alt="avatar" />
                ) : (
                  <span>{(currentUser?.full_name || "Unknown")[0].toUpperCase()}</span>
                )}
              </div>
              <div className="settings-menu-profile-info">
                <h4>{currentUser?.full_name || "Unknown"}</h4>
                <span>{currentUser?.email}</span>
              </div>
            </div>

            <div className="settings-menu-section">
              <div onClick={() => { setSettingsInitialView("main"); setShowSettings(true); setShowMenu(false) }}>
                <span className="settings-menu-icon">👤</span> {t("menu_myProfile")}
              </div>
            </div>

            <div className="settings-menu-section">
              <div onClick={handleCreateGroup}>
                <span className="settings-menu-icon">👥</span> {t("menu_newGroup")}
              </div>
              <div onClick={() => { setShowChannelModal(true); setShowMenu(false) }}>
                <span className="settings-menu-icon">📢</span> {t("menu_newChannel")}
              </div>
              <div onClick={() => { setShowPublicChannels(true); setShowMenu(false) }}>
                <span className="settings-menu-icon">🔍</span> {t("menu_publicChannels")}
              </div>
            </div>

            <div className="settings-menu-section">
              <div onClick={() => { setShowContacts(true); setShowMenu(false) }}>
                <span className="settings-menu-icon">👤</span> {t("menu_contacts")}
              </div>
              <div onClick={() => { setShowCalls(true); setShowMenu(false) }}>
                <span className="settings-menu-icon">📞</span> {t("menu_calls")}
              </div>
            </div>

            {currentUser?.is_staff && (
              <div className="settings-menu-section">
                <div onClick={() => { setShowModeration(true); setShowMenu(false) }}>
                  <span className="settings-menu-icon">🛡️</span> Moderation
                </div>
              </div>
            )}

            <div className="settings-menu-section">
              <div onClick={openSavedMessages}>
                <span className="settings-menu-icon">🔖</span> {t("menu_savedMessages")}
              </div>
              <div onClick={() => { setSettingsInitialView("main"); setShowSettings(true); setShowMenu(false) }}>
                <span className="settings-menu-icon">⚙️</span> {t("menu_settings")}
              </div>
              <div
                onClick={(e) => {
                  e.stopPropagation()
                  toggleDarkMode()
                }}
              >
                <span className="settings-menu-icon">🌙</span> {t("menu_nightMode")}
                <label className="settings-menu-switch" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={darkMode}
                    onChange={toggleDarkMode}
                  />
                  <span className="settings-menu-switch-slider" />
                </label>
              </div>
            </div>

            <div className="settings-menu-section">
              <div className="danger" onClick={handleLogout}>
                <span className="settings-menu-icon">🚪</span> {t("menu_logout")}
              </div>
            </div>

            <div className="settings-menu-footer">Nexus Chat</div>
          </div>
        )}

        {/* CHATS LIST */}
        <SidebarHeader
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
          folderTab={folderTab}
          onFolderChange={setFolderTab}
          onOpenMenu={() => setShowMenu(!showMenu)}
        />
        <ChatsList
          searchTerm={searchTerm}
          folderTab={folderTab}
          currentUser={currentUser}
          selectedConversationId={selectedUser?.conversationId}
          onSelectChat={(chat) => {
            setSelectedUser(chat)
            setIsSidebarOpen(false)
          }}
        />
      </div>

      {/* CHAT AREA */}
      <div className="chat-area">
        {selectedUser ? (
          <ChatContainer
            key={selectedUser.conversationId ?? `new-${selectedUser.otherUserId}`}
            selectedUser={selectedUser}
            onSelectUser={setSelectedUser}
            currentUser={currentUser}
            users={users}
            onBack={() => {
              setSelectedUser(null)
              setIsSidebarOpen(true)
            }}
          />
        ) : (
          <div className="welcome-container">
            <div className="welcome-content">
              <h2>Welcome to Chat</h2>
              <p>Select a user to start messaging</p>
              <div className="badge">✨ New</div>
            </div>
          </div>
        )}
      </div>

      {/* SETTINGS MODAL */}
      {showSettings && (
        <SettingsModal
          user={currentUser}
          initialView={settingsInitialView}
          onClose={() => setShowSettings(false)}
          onEditProfile={() => {
            setShowSettings(false)
            setShowEdit(true)
          }}
          onLogout={handleLogout}
        />
      )}

      {/* 🔥 PROFILE EDIT MODAL */}
      {showEdit && (
  <ProfileEdit
    user={currentUser}
    onClose={() => setShowEdit(false)}
    onUpdate={(updatedUser) => {
      const cleanUser = {
        ...updatedUser,
        avatar_url: updatedUser.avatar_url || null
      }

      setCurrentUser(cleanUser)
      localStorage.setItem("user", JSON.stringify(cleanUser))
    }}
  />
)}


{showGroupModal && (
  <CreateGroupModal
  users={users}
  onClose={() => setShowGroupModal(false)}
  onCreated={() => setShowGroupModal(false)}
/>
)}

{showContacts && (
  <ContactsModal
    users={users}
    onClose={() => setShowContacts(false)}
    onSelectContact={handleSelectContact}
  />
)}

{showChannelModal && (
  <CreateChannelModal
    users={users}
    onClose={() => setShowChannelModal(false)}
    onCreated={(conversation) => {
      setSelectedUser({
        conversationId: conversation.id,
        type: "channel",
        displayName: conversation.name,
        avatarUrl: conversation.avatar_url,
        otherUserId: null,
        membersCount: conversation.members_count,
        isMuted: conversation.is_muted,
        isPinned: conversation.is_pinned,
        lastSeen: null,
      })
    }}
  />
)}

{showCalls && (
  <CallsListModal
    users={users}
    onClose={() => setShowCalls(false)}
  />
)}

{showModeration && (
  <ModerationPanel onClose={() => setShowModeration(false)} />
)}

{showPublicChannels && (
  <PublicChannelsModal
    onClose={() => setShowPublicChannels(false)}
    onJoined={(conversation) => {
      setSelectedUser({
        conversationId: conversation.id,
        type: "channel",
        displayName: conversation.name,
        avatarUrl: conversation.avatar_url,
        otherUserId: null,
        membersCount: conversation.members_count,
        isMuted: conversation.is_muted,
        isPinned: conversation.is_pinned,
        lastSeen: null,
      })
      setShowPublicChannels(false)
      setIsSidebarOpen(false)
    }}
  />
)}

    </div>
    </ConnectedCallProvider>
    </ChatsProvider>
  )
}

export default Chat