import { useState, useEffect } from "react"
import api from "../api/axios"
import { useChats } from "../context/ChatsContext"

function CreateGroupModal({ users, onClose, onCreated }) {
  const { upsertConversation } = useChats()
  const [name, setName] = useState("")
  const [selectedUsers, setSelectedUsers] = useState([])
  const [searchTerm, setSearchTerm] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  // Filter users based on search
  const filteredUsers = users.filter(user => 
    user.username?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.email?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const toggleUser = (id) => {
    setSelectedUsers(prev =>
      prev.includes(id)
        ? prev.filter(u => u !== id)
        : [...prev, id]
    )
  }

  const selectAll = () => {
    if (selectedUsers.length === filteredUsers.length) {
      setSelectedUsers([])
    } else {
      setSelectedUsers(filteredUsers.map(u => u.id))
    }
  }

  const createGroup = async () => {
    if (!name.trim()) {
      setError("Group name is required")
      return
    }

    if (selectedUsers.length < 2) {
      setError("Please select at least 2 members")
      return
    }

    setLoading(true)
    setError("")

    try {
      const res = await api.post("/conversations/", {
        type: "group",
        name: name.trim(),
        participant_ids: selectedUsers
      })

      upsertConversation(res.data)
      onCreated(res.data)
      onClose()
    } catch (error) {
      console.error("Create group error", error)
      setError(error.response?.data?.message || "Failed to create group. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  // Get avatar color
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

  // Handle keyboard events
  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      onClose()
    } else if (e.key === 'Enter' && e.ctrlKey) {
      createGroup()
    }
  }

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [name, selectedUsers])

  return (
    <div className="create-group-modal-overlay" onClick={onClose}>
      <div className="create-group-modal" onClick={e => e.stopPropagation()}>
        
        {/* Modal Header */}
        <div className="modal-header">
          <h2>Create New Group</h2>
          <p>Start a conversation with multiple people</p>
          <button className="close-btn" onClick={onClose}>
            ×
          </button>
        </div>

        {/* Modal Content */}
        <div className="modal-content">
          
          {/* Group Name Input */}
          <div className="input-group">
            <label>Group Name</label>
            <input
              type="text"
              className="group-name-input"
              placeholder="e.g., Project Team, Friends, Family"
              value={name}
              onChange={e => setName(e.target.value)}
              autoFocus
              maxLength={50}
            />
          </div>

          {/* Members Selection */}
          <div className="members-section">
            <h3>
              Select Members
              <span className="members-count">
                {selectedUsers.length} / {users.length}
              </span>
            </h3>

            {/* Search */}
            <div className="search-members">
              <input
                type="text"
                placeholder="Search members..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
            </div>

            {/* Select All */}
            {filteredUsers.length > 0 && (
              <div className="select-actions">
                <button 
                  className="select-all-btn"
                  onClick={selectAll}
                >
                  {selectedUsers.length === filteredUsers.length ? 'Clear All' : 'Select All'}
                </button>
              </div>
            )}

            {/* Members List */}
            <div className="members-list">
              {filteredUsers.length === 0 ? (
                <div className="no-results">
                  {searchTerm ? 'No users match your search' : 'No users available'}
                </div>
              ) : (
                filteredUsers.map(user => (
                  <div
                    key={user.id}
                    className={`member-item ${selectedUsers.includes(user.id) ? 'selected' : ''}`}
                    onClick={() => toggleUser(user.id)}
                  >
                    <div className="member-checkbox">
                      {selectedUsers.includes(user.id) && '✓'}
                    </div>
                    
                    <div 
                      className="member-avatar-small"
                      style={{ backgroundColor: getAvatarColor(user.username) }}
                    >
                      {user.username?.[0]?.toUpperCase()}
                    </div>
                    
                    <div className="member-info">
                      <div className="member-name">{user.username}</div>
                      <div className="member-email">
                        {user.email || 'No email'}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Selected Members Summary */}
            {selectedUsers.length > 0 && (
              <div className="selected-summary">
                <p>Selected ({selectedUsers.length})</p>
                <div className="selected-tags">
                  {selectedUsers.map(id => {
                    const user = users.find(u => u.id === id)
                    return user && (
                      <span
                        key={id}
                        className="selected-tag"
                        onClick={(e) => {
                          e.stopPropagation()
                          toggleUser(id)
                        }}
                      >
                        {user.username}
                      </span>
                    )
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Error Message */}
          {error && (
            <div className="error-message">
              {error}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="modal-footer">
          <button 
            className="cancel-btn" 
            onClick={onClose}
            disabled={loading}
          >
            Cancel
          </button>
          <button 
            className="create-btn" 
            onClick={createGroup}
            disabled={loading || !name.trim() || selectedUsers.length < 2}
          >
            {loading ? (
              <>
                <span className="btn-spinner"></span>
                Creating...
              </>
            ) : (
              'Create Group'
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

export default CreateGroupModal