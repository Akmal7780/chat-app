import { useState, useRef, useEffect, lazy, Suspense } from "react"
import api from "../api/axios"
import "./StickerGifPicker.css"

const EmojiPicker = lazy(() => import("emoji-picker-react"))

const STICKERS = [
  "😂", "❤️", "🔥", "🎉", "😍", "👍", "😭", "🥳", "😎", "🤔",
  "😱", "🙌", "💯", "🤗", "😴", "🥰", "😡", "🤩", "👋", "🙏",
  "🎂", "🍕", "☕", "🌈", "⚡", "🎈", "🐶", "🐱", "🌟", "💪",
]

// Single popup for Emoji / Stickers / GIFs, switched via tabs (Telegram-style
// — one icon, one panel). Emoji picks insert into the compose box
// (onSelectEmoji); stickers/GIFs send immediately (onSend). A sticker is a
// large emoji stored as plain message content (message_type "sticker"); a
// GIF is a Giphy CDN URL stored the same way (message_type "gif") — see
// ChatContainer.jsx::sendMessage and consumers.py::receive.
const GIF_PAGE_SIZE = 24

function StickerGifPicker({ onSelectEmoji, onSend }) {
  const [tab, setTab] = useState("emoji")
  const [query, setQuery] = useState("")
  const [gifs, setGifs] = useState([])
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [error, setError] = useState(null)
  const debounceRef = useRef(null)
  const activeQueryRef = useRef("")

  // Fresh search — resets to page 1. Debounced on every keystroke.
  useEffect(() => {
    if (tab !== "gif") return
    clearTimeout(debounceRef.current)

    if (!query.trim()) {
      setGifs([])
      setError(null)
      setHasMore(true)
      return
    }

    debounceRef.current = setTimeout(async () => {
      const q = query.trim()
      activeQueryRef.current = q
      setLoading(true)
      setError(null)
      try {
        const res = await api.get("/gif-search/", { params: { q } })
        if (activeQueryRef.current !== q) return // a newer search superseded this one
        setGifs(res.data)
        setHasMore(res.data.length >= GIF_PAGE_SIZE)
      } catch (err) {
        console.error("GIF search error:", err)
        setGifs([])
        setHasMore(false)
        setError(err.response?.data?.error || "GIF search failed")
      } finally {
        setLoading(false)
      }
    }, 400)

    return () => clearTimeout(debounceRef.current)
  }, [query, tab])

  // Infinite scroll — appends the next page for the same query.
  const loadMoreGifs = async () => {
    const q = query.trim()
    if (!q || loading || loadingMore || !hasMore) return

    setLoadingMore(true)
    try {
      const res = await api.get("/gif-search/", { params: { q, offset: gifs.length } })
      if (activeQueryRef.current !== q) return
      setGifs((prev) => [...prev, ...res.data])
      setHasMore(res.data.length >= GIF_PAGE_SIZE)
    } catch (err) {
      console.error("GIF load-more error:", err)
      setHasMore(false)
    } finally {
      setLoadingMore(false)
    }
  }

  const handleGifScroll = (e) => {
    const { scrollTop, scrollHeight, clientHeight } = e.target
    if (scrollHeight - scrollTop - clientHeight < 120) {
      loadMoreGifs()
    }
  }

  return (
    <div className="sticker-gif-picker">
      <div className="sticker-gif-tabs">
        <button className={tab === "emoji" ? "active" : ""} onClick={() => setTab("emoji")}>
          😀 Emoji
        </button>
        <button className={tab === "stickers" ? "active" : ""} onClick={() => setTab("stickers")}>
          🎉 Stickers
        </button>
        <button className={tab === "gif" ? "active" : ""} onClick={() => setTab("gif")}>
          🎬 GIFs
        </button>
      </div>

      {tab === "emoji" ? (
        <Suspense fallback={<div className="gif-status">Loading…</div>}>
          <EmojiPicker
            onEmojiClick={(emojiData) => onSelectEmoji(emojiData.emoji)}
            width="100%"
            height={320}
          />
        </Suspense>
      ) : tab === "stickers" ? (
        <div className="sticker-grid">
          {STICKERS.map((emoji) => (
            <button key={emoji} className="sticker-item" onClick={() => onSend(emoji, "sticker")}>
              {emoji}
            </button>
          ))}
        </div>
      ) : (
        <div className="gif-panel">
          <input
            className="gif-search-input"
            placeholder="Search GIFs..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
          <div className="gif-grid" onScroll={handleGifScroll}>
            {loading && <div className="gif-status">Searching…</div>}
            {!loading && gifs.map((gif) => (
              <button key={gif.id} className="gif-item" onClick={() => onSend(gif.gif_url, "gif")}>
                <img src={gif.preview_url} alt="" />
              </button>
            ))}
            {!loading && loadingMore && (
              <div className="gif-status">Loading more…</div>
            )}
            {!loading && error && (
              <div className="gif-status">{error}</div>
            )}
            {!loading && !error && query.trim() && gifs.length === 0 && (
              <div className="gif-status">No results</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default StickerGifPicker
