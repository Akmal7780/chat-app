import { useState } from "react"
import toast from "react-hot-toast"
import api from "../api/axios"
import "./ViewOnceAttachment.css"

// Renders a view-once photo/video bubble in one of three states:
//   1. not yet opened, I'm the recipient  -> "Tap to view" (fetches the
//      one-shot blob from /messages/{id}/view-once/open/, which deletes the
//      file server-side right after serving it — see services.open_view_once_media)
//   2. not yet opened, I'm the sender     -> locked "Sent" indicator, no click
//   3. already opened (either side)       -> "Opened" indicator, no click
function ViewOnceAttachment({ message, isMine, fileType }) {
  const [loading, setLoading] = useState(false)
  const [viewerUrl, setViewerUrl] = useState(null)
  const [locallyOpened, setLocallyOpened] = useState(false)

  const opened = !!message.viewed_at || locallyOpened
  const icon = fileType === "video" ? "🎥" : "🖼️"

  const openMedia = async () => {
    if (loading || opened || isMine) return
    setLoading(true)
    try {
      const res = await api.post(`/messages/${message.id}/view-once/open/`, {}, { responseType: "blob" })
      setLocallyOpened(true)
      setViewerUrl(URL.createObjectURL(res.data))
    } catch (err) {
      console.error("View-once open error:", err)
      toast.error(err.response?.data?.error || "This media is no longer available")
    } finally {
      setLoading(false)
    }
  }

  const closeViewer = () => {
    if (viewerUrl) URL.revokeObjectURL(viewerUrl)
    setViewerUrl(null)
  }

  return (
    <>
      <button
        className={`view-once-badge ${opened ? "opened" : ""} ${isMine ? "mine" : ""}`}
        onClick={openMedia}
        disabled={opened || isMine || loading}
      >
        <span className="view-once-badge-icon">🔥</span>
        {opened
          ? "Opened"
          : loading
          ? "Loading…"
          : isMine
          ? `Sent · ${icon} View once`
          : `Tap to view · ${icon}`}
      </button>

      {viewerUrl && (
        <div className="view-once-viewer" onClick={closeViewer}>
          {fileType === "video" ? (
            <video src={viewerUrl} controls autoPlay onClick={(e) => e.stopPropagation()} />
          ) : (
            <img src={viewerUrl} alt="View once" onClick={(e) => e.stopPropagation()} />
          )}
          <button className="view-once-viewer-close" onClick={closeViewer}>×</button>
        </div>
      )}
    </>
  )
}

export default ViewOnceAttachment
