// Telegram-style relative/absolute timestamp helpers, shared across
// ChatsList, ChatContainer and search results so formatting stays consistent.

const isSameDay = (a, b) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate()

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

// Chat-list row timestamp: "3:28 PM" today, weekday name this week, "Aug 21" older.
export function formatChatTimestamp(dateString) {
  if (!dateString) return ""

  const date = new Date(dateString)
  const now = new Date()

  if (isSameDay(date, now)) {
    return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
  }

  const diffDays = Math.floor((now - date) / (1000 * 60 * 60 * 24))

  if (diffDays < 7) {
    return WEEKDAYS[date.getDay()]
  }

  return date.toLocaleDateString([], { month: "short", day: "numeric" })
}

// Longer-form "last seen" text (profile/header use).
export function formatLastSeen(dateString) {
  if (!dateString) return "Recently"

  const date = new Date(dateString)
  const now = new Date()
  const diffMinutes = Math.floor((now - date) / (1000 * 60))

  if (diffMinutes < 1) return "just now"
  if (diffMinutes < 60) return `${diffMinutes} min ago`

  const diffHours = Math.floor(diffMinutes / 60)
  if (diffHours < 24) return `${diffHours} hours ago`

  const diffDays = Math.floor(diffHours / 24)
  if (diffDays < 7) return `${diffDays} days ago`

  return date.toLocaleDateString()
}
