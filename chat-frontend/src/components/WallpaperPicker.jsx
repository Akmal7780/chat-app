import { useRef } from "react"
import toast from "react-hot-toast"
import api from "../api/axios"
import "./WallpaperPicker.css"

export const WALLPAPER_PRESETS = [
  { id: "obsidian", name: "Obsidian", emoji: "🌙", css: "linear-gradient(135deg, #1a1a2e, #16213e)" },
  { id: "sunset", name: "Sunset", emoji: "🌅", css: "linear-gradient(135deg, #ff6b6b, #feca57)" },
  { id: "ocean", name: "Ocean", emoji: "🌊", css: "linear-gradient(135deg, #2193b0, #6dd5ed)" },
  { id: "forest", name: "Forest", emoji: "🌲", css: "linear-gradient(135deg, #134e5e, #71b280)" },
  { id: "violet", name: "Violet", emoji: "💜", css: "linear-gradient(135deg, #654ea3, #eaafc8)" },
  { id: "midnight", name: "Midnight", emoji: "✨", css: "linear-gradient(135deg, #0f2027, #203a43, #2c5364)" },
  { id: "rose", name: "Rose", emoji: "🌸", css: "linear-gradient(135deg, #ee9ca7, #ffdde1)" },
  { id: "slate", name: "Arcade", emoji: "🎮", css: "linear-gradient(135deg, #3a6073, #16222a)" },
]

// A light, tiled emoji-doodle pattern layered over the gradient — the same
// idea as Telegram's chat-wallpaper patterns, built as an inline SVG so no
// external image assets are needed.
function patternDataUri(emoji) {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='72' height='72'>` +
    `<text x='6' y='30' font-size='24' opacity='0.35'>${emoji}</text>` +
    `<text x='40' y='64' font-size='24' opacity='0.35'>${emoji}</text>` +
    `</svg>`
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`
}

function presetBackground(preset) {
  return {
    backgroundImage: `${patternDataUri(preset.emoji)}, ${preset.css}`,
    backgroundRepeat: "repeat, no-repeat",
    backgroundSize: "72px 72px, cover",
  }
}

export function wallpaperStyleFor(type, value, url) {
  if (type === "preset") {
    const preset = WALLPAPER_PRESETS.find((p) => p.id === value)
    return preset ? presetBackground(preset) : {}
  }
  if (type === "image" && url) {
    return {
      backgroundImage: `url(${url})`,
      backgroundSize: "cover",
      backgroundPosition: "center",
    }
  }
  return {}
}

// Shared wallpaper picker, used from the chat header's "⋮" menu (all
// conversation types) — sets a per-user, per-conversation chat background via
// POST /conversations/{id}/wallpaper/ (see ConversationParticipant.wallpaper_*).
function WallpaperPicker({ conversationId, currentType, currentValue, onUpdated, className = "" }) {
  const fileInputRef = useRef(null)

  const applyWallpaper = async (payload) => {
    try {
      const res = await api.post(`/conversations/${conversationId}/wallpaper/`, payload)
      onUpdated?.(res.data)
    } catch (err) {
      console.error("Wallpaper update error:", err)
      toast.error("Failed to update wallpaper")
    }
  }

  const handlePresetClick = (preset) => {
    applyWallpaper({ wallpaper_type: "preset", wallpaper_value: preset.id })
  }

  const handleReset = () => {
    applyWallpaper({ wallpaper_type: "default" })
  }

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file) return

    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image file")
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image must be under 5MB")
      return
    }

    const formData = new FormData()
    formData.append("wallpaper_type", "image")
    formData.append("wallpaper_image", file)

    try {
      const res = await api.post(`/conversations/${conversationId}/wallpaper/`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      })
      onUpdated?.(res.data)
    } catch (err) {
      console.error("Wallpaper upload error:", err)
      toast.error("Failed to upload wallpaper")
    }
  }

  return (
    <div className={`wallpaper-picker ${className}`}>
      <div className="wallpaper-picker-grid">
        {WALLPAPER_PRESETS.map((preset) => (
          <button
            key={preset.id}
            className={`wallpaper-swatch ${currentType === "preset" && currentValue === preset.id ? "selected" : ""}`}
            style={presetBackground(preset)}
            onClick={() => handlePresetClick(preset)}
          >
            <span className="wallpaper-swatch-name">{preset.name}</span>
          </button>
        ))}
      </div>
      <button className="wallpaper-picker-action" onClick={() => fileInputRef.current?.click()}>
        🖼️ Upload photo
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={handleFileChange}
      />
      <button className="wallpaper-picker-action" onClick={handleReset} disabled={currentType === "default"}>
        ↩️ Reset to default
      </button>
    </div>
  )
}

export default WallpaperPicker
