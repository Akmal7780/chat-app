import { useState, useEffect, useRef } from "react"
import api from "../../api/axios"
import "./MessageReactions.css"  

function MessageReactions({ message, currentUser, onReactionUpdate, onClose }) {

  const commonEmojis = [
    { emoji: "👍", name: "thumbs up" },
    { emoji: "❤️", name: "heart" },
    { emoji: "😂", name: "laugh" },
    { emoji: "😮", name: "wow" },
    { emoji: "😢", name: "sad" },
    { emoji: "👏", name: "clap" },
    { emoji: "🔥", name: "fire" },
    { emoji: "🎉", name: "party" }
  ]

  const reactions = message.reactions || []



  // =========================
  // HELPER FUNCTIONS
  // =========================
  const hasUserReacted = (emoji) => {
    return reactions.some(r => r.user_id === currentUser?.id && r.emoji === emoji)
  }

  const getReactionUsers = (emoji) => {
    const users = reactions
      .filter(r => r.emoji === emoji)
      .map(r => r.display_name || `User ${r.user_id}`)
      .filter((v, i, a) => a.indexOf(v) === i)

    if (users.length === 0) return ""
    if (users.length === 1) return users[0]
    if (users.length === 2) return `${users[0]} and ${users[1]}`
    return `${users[0]}, ${users[1]} and ${users.length - 2} others`
  }

  // =========================
  // HANDLE REACTION
  // =========================
 const handleReaction = async (emoji) => {
  if (!emoji || emoji === "undefined") return

  try {
    const existing = reactions.find(
      r => r.user_id === currentUser?.id
    )

    // =========================
    // 🔴 REMOVE (same emoji)
    // =========================
    if (existing && existing.emoji === emoji) {
        if (existing.id) {
    await api.delete(`/messages/${message.id}/reactions/${existing.id}/`)
  }
    }

    // =========================
    // 🔁 ADD yoki REPLACE
    // =========================
    else {
      await api.post(`/messages/${message.id}/reactions/`, { emoji })
    }

  } catch (err) {
    console.error("❌ Reaction error:", err)
  }

  onClose?.()
}

  // =========================
  // Group reactions
  // =========================
  const groupedReactions = reactions.reduce((acc, r) => {
  if (!r || !r.emoji || r.emoji === "undefined") return acc

  if (!acc[r.emoji]) acc[r.emoji] = []
  acc[r.emoji].push(r)

  return acc
}, {})

  return (
    <div className="message-reactions-container">

      {/* REACTION BADGES */}
      {Object.keys(groupedReactions).length > 0 && (
        <div className="reactions-bar">
          {Object.entries(groupedReactions).map(([emoji, users]) => {
            if (!emoji || emoji === 'undefined') return null
            
            return (
              <button
                key={emoji}
                className={`reaction-badge ${hasUserReacted(emoji) ? "reacted" : ""}`}
                onClick={() => handleReaction(emoji)}
                title={getReactionUsers(emoji)}
              >
                <span className="reaction-emoji">{emoji}</span>
                <span className="reaction-count">{users?.length || 0}</span>
              </button>
            )
          })}
        </div>
      )}

    </div>
  )
}

export default MessageReactions