import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import UsersList from "../components/UsersList"
import ChatContainer from "../components/ChatContainer"
import ProfileEdit from "../components/ProfileEdit"
import "../styles/chat.css"

function Chat() {
  const [selectedUser, setSelectedUser] = useState(null)
  const [currentUser, setCurrentUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [initialLoad, setInitialLoad] = useState(true)
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [showEdit, setShowEdit] = useState(false)

  const navigate = useNavigate()

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

  const handleLogout = () => {
    localStorage.clear()
    navigate("/")
  }

  if (loading || initialLoad) {
    return (
      <div className="loading-page">
        <div className="spinner-pulse"></div>
        <p>Loading chat application...</p>
        {currentUser && (
          <div className="welcome-message">
            Welcome back, {currentUser.username}!
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
    <div className="chat-main">
      
      {/* ☰ Mobile sidebar */}
      <button 
        className="sidebar-toggle"
        onClick={() => setIsSidebarOpen(!isSidebarOpen)}
      >
        ☰
      </button>

      {/* SIDEBAR */}
      <div className={`chat-sidebar ${isSidebarOpen ? 'open' : ''}`}>
        
        {/* 👤 USER INFO (CLICKABLE) */}
        <div className="user-info glass-effect">
          <div 
            className="user-info-row"
            onClick={() => setShowEdit(true)}   // 🔥 PROFILE EDIT OPEN
            style={{ cursor: "pointer" }}
          >
            

<div className="user-avatar neon-glow">
  {hasAvatar ? (
    <img src={currentUser.avatar_url} alt="avatar" />
  ) : (
    <span>
      {currentUser?.username?.[0]?.toUpperCase() || "U"}
    </span>
  )}
</div>

            <div className="user-details">
              <h3>{currentUser?.username}</h3>
              <small>{currentUser?.email}</small>
            </div>
          </div>

          {/* LOGOUT */}
          <button onClick={handleLogout} className="logout-btn">
            <span className="logout-icon">⏻</span>
            <span>Logout</span>
          </button>
        </div>

        {/* USERS LIST */}
        <UsersList
          onSelectUser={(user) => {
            setSelectedUser(user)
            setIsSidebarOpen(false)
          }}
          currentUser={currentUser}
          selectedUserId={selectedUser?.id}
        />
      </div>

      {/* CHAT AREA */}
      <div className="chat-area">
        {selectedUser ? (
          <ChatContainer
            key={selectedUser.id}
            selectedUser={selectedUser}
            onSelectUser={setSelectedUser}
            currentUser={currentUser}
            onBack={() => {
              setSelectedUser(null)
              setIsSidebarOpen(true)
            }}
          />
        ) : (
          <div className="welcome-container">
            <div className="welcome-content glass-effect">
              <h2>Welcome to Chat</h2>
              <p>Select a user to start messaging</p>
              <div className="badge">✨ New</div>
            </div>
          </div>
        )}
      </div>

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

    </div>
  )
}

export default Chat