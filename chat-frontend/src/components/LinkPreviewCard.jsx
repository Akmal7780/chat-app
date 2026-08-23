import { useEffect, useState } from "react"
import api from "../api/axios"
import "./LinkPreviewCard.css"

// Shared across all instances so the same URL isn't re-fetched every time
// a message re-renders or scrolls back into view.
const previewCache = new Map()

function LinkPreviewCard({ url }) {
  const [preview, setPreview] = useState(() => previewCache.get(url) ?? null)

  useEffect(() => {
    if (!url || previewCache.has(url)) return

    let cancelled = false

    api
      .get("/link-preview/", { params: { url } })
      .then((res) => {
        if (cancelled) return
        previewCache.set(url, res.data)
        setPreview(res.data)
      })
      .catch(() => {
        if (cancelled) return
        previewCache.set(url, null)
      })

    return () => {
      cancelled = true
    }
  }, [url])

  if (!preview) return null

  return (
    <a
      href={preview.url}
      target="_blank"
      rel="noopener noreferrer"
      className="link-preview-card"
      onClick={(e) => e.stopPropagation()}
    >
      {preview.image && (
        <div className="link-preview-image">
          <img src={preview.image} alt="" />
        </div>
      )}
      <div className="link-preview-body">
        {preview.site_name && (
          <span className="link-preview-site">{preview.site_name}</span>
        )}
        <span className="link-preview-title">{preview.title}</span>
        {preview.description && (
          <span className="link-preview-desc">{preview.description}</span>
        )}
      </div>
    </a>
  )
}

export default LinkPreviewCard
