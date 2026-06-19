import { useEffect, useState } from "react";
import api from "../api/axios";
import "../styles/chat.css";
import CreateGroupModal from "./CreateGroupModal";
import { useOnlineUsers } from "../context/OnlineUsersContext";

function UsersList({ onSelectUser, currentUser, selectedUserId}) {
  const { onlineUsers, users, setUsers } = useOnlineUsers();
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showGroupModal, setShowGroupModal] = useState(false);

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const res = await api.get("/users/users_list/");
        const data = res.data.results || res.data;

        const otherUsers = data.filter(
          (user) => user.id !== currentUser?.id
        );

        setUsers(otherUsers);
      } catch (error) {
        console.log("Users fetch error:", error);
      }
    };

    const fetchConversations = async () => {
      try {
        const res = await api.get("/conversations/");
        setConversations(res.data);
      } catch (error) {
        console.log("Conversation fetch error:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchUsers();
    fetchConversations();
  }, [currentUser]);

  const groups = conversations.filter(
    (conv) => conv.type === "group"
  );

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
      "#795548",
    ];

    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }

    return colors[Math.abs(hash) % colors.length];
  };

  const formatLastSeen = (lastSeen) => {
    if (!lastSeen) return "Recently";

    const now = new Date();
    const lastSeenDate = new Date(lastSeen);
    const diffMinutes = Math.floor(
      (now - lastSeenDate) / (1000 * 60)
    );

    if (diffMinutes < 1) return "Online";
    if (diffMinutes < 60) return `${diffMinutes} min ago`;

    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return `${diffHours} hours ago`;

    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays} days ago`;

    return lastSeenDate.toLocaleDateString();
  };

  const isOnline = (lastSeen) => {
    if (!lastSeen) return false;

    const now = new Date();
    const lastSeenDate = new Date(lastSeen);
    const diffMinutes = Math.floor(
      (now - lastSeenDate) / (1000 * 60)
    );

    return diffMinutes < 5;
  };

  if (loading) {
    return (
      <div className="loading-container">
        <div className="spinner"></div>
        <span>Loading users...</span>
      </div>
    );
  }

  return (
    <div className="users-list-container">
      {/* <button
        className="create-group-btn"
        onClick={() => setShowGroupModal(true)}
      >
        + Create Group
      </button> */}

      {/* GROUPS */}
      <div className="users-header">
        <span>GROUPS</span>
        <span className="badge">{groups.length}</span>
      </div>

      {groups.map((group) => (
        <div
          key={group.id}
          onClick={() => onSelectUser(group)}
          className="user-card"
        >
          <div className="avatar-container">
            <div className="user-avatar-small">👥</div>
          </div>

          <div className="user-info-compact">
            <div className="user-name">{group.name}</div>
            <div className="user-email">
              {group.members_count} members
            </div>
          </div>
        </div>
      ))}

      {/* USERS */}
      <div className="users-header">
        <span>USERS</span>
        <span className="badge">{users.length}</span>
      </div>

      {users.length === 0 ? (
        <div className="empty-state">No users found</div>
      ) : (
        users.map((user, index) => {
          const online = onlineUsers?.has(Number(user.id));

          return (
            <div
              key={user.id}
              onClick={() => onSelectUser(user)}
              className={`user-card ${
                selectedUserId === user.id ? "active" : ""
              }`}
              style={{ animationDelay: `${index * 0.1}s` }}
            >
              <div className="avatar-container">
            {user.avatar_url || user.avatar ? (
            <img
              src={user.avatar_url || user.avatar}
              alt="avatar"
              className="user-avatar-small"
            />
          ) : (
              <div
                className="user-avatar-small"
                style={{
                  backgroundColor: getAvatarColor(user.username),
                }}
              >
                {user.username?.[0]?.toUpperCase()}
              </div>
            )}

            <span
              className={`status-dot ${online ? "online" : "offline"}`}
            ></span>
          </div>

              <div className="user-info-compact">
                <div className="user-name">{user.username}</div>

                <div className="user-email">
                  {online ? (
                    <span className="online-status">🟢 Online</span>
                  ) : (
                    <span className="last-seen">
                      {formatLastSeen(user.last_seen)}
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })
      )}

      {showGroupModal && (
        <CreateGroupModal
          users={users}
          onClose={() => setShowGroupModal(false)}
          onCreated={(group) => {
            setConversations((prev) => [group, ...prev]);
            setShowGroupModal(false);
          }}
        />
      )}
    </div>
  );
}

export default UsersList;