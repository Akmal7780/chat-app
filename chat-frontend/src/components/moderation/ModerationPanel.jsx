import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import toast from "react-hot-toast"
import api from "../../api/axios"
import ConfirmModal from "../modals/ConfirmModal"
import "./ModerationPanel.css"

function ModerationPanel({ onClose }) {
  const [tab, setTab] = useState("reports")
  const [reports, setReports] = useState([])
  const [showResolved, setShowResolved] = useState(false)
  const [words, setWords] = useState([])
  const [newWord, setNewWord] = useState("")
  const [loading, setLoading] = useState(true)
  const [confirmDialog, setConfirmDialog] = useState(null)

  const loadReports = () => {
    setLoading(true)
    api.get("/moderation/reports/", { params: { resolved: showResolved ? "1" : "0" } })
      .then((res) => setReports(res.data))
      .catch((err) => console.error("Load reports error:", err))
      .finally(() => setLoading(false))
  }

  const loadWords = () => {
    setLoading(true)
    api.get("/moderation/banned-words/")
      .then((res) => setWords(res.data))
      .catch((err) => console.error("Load banned words error:", err))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    if (tab === "reports") loadReports()
    else loadWords()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, showResolved])

  const resolveReport = async (report) => {
    try {
      const path = report.kind === "message"
        ? `/moderation/reports/message/${report.id}/resolve/`
        : `/moderation/reports/conversation/${report.id}/resolve/`
      await api.post(path)
      setReports((prev) => prev.filter((r) => !(r.kind === report.kind && r.id === report.id)))
      toast.success("Marked resolved")
    } catch (err) {
      console.error("Resolve report error:", err)
      toast.error("Failed to resolve")
    }
  }

  const deleteReportedMessage = (report) => {
    setConfirmDialog({
      title: "Delete message",
      message: "Delete this message? This can't be undone.",
      confirmLabel: "Delete",
      danger: true,
      onConfirm: async () => {
        try {
          await api.post(`/moderation/reports/message/${report.id}/delete-message/`)
          setReports((prev) => prev.filter((r) => !(r.kind === "message" && r.id === report.id)))
          toast.success("Message deleted")
        } catch (err) {
          console.error("Delete message error:", err)
          toast.error("Failed to delete message")
        }
      },
    })
  }

  const addWord = async () => {
    const word = newWord.trim()
    if (!word) return
    try {
      const res = await api.post("/moderation/banned-words/", { word })
      setWords((prev) => [...prev, res.data].sort((a, b) => a.word.localeCompare(b.word)))
      setNewWord("")
    } catch (err) {
      const msg = err.response?.data?.error || "Failed to add word"
      toast.error(msg)
    }
  }

  const removeWord = async (word) => {
    try {
      await api.delete(`/moderation/banned-words/${word.id}/`)
      setWords((prev) => prev.filter((w) => w.id !== word.id))
    } catch (err) {
      console.error("Remove word error:", err)
      toast.error("Failed to remove word")
    }
  }

  return <>
    {createPortal(
    <div className="poll-modal-overlay" onClick={onClose}>
      <div className="poll-modal moderation-panel" onClick={(e) => e.stopPropagation()}>
        <div className="poll-modal-header">
          <h3>🛡️ Moderation</h3>
          <button onClick={onClose}>×</button>
        </div>

        <div className="moderation-tabs">
          <button className={tab === "reports" ? "active" : ""} onClick={() => setTab("reports")}>
            Reports
          </button>
          <button className={tab === "words" ? "active" : ""} onClick={() => setTab("words")}>
            Banned words
          </button>
        </div>

        <div className="poll-modal-body">
          {tab === "reports" && (
            <>
              <label className="moderation-resolved-toggle">
                <input
                  type="checkbox"
                  checked={showResolved}
                  onChange={(e) => setShowResolved(e.target.checked)}
                />
                Show resolved
              </label>

              {loading ? (
                <div className="moderation-empty">Loading…</div>
              ) : reports.length === 0 ? (
                <div className="moderation-empty">No {showResolved ? "resolved" : "open"} reports</div>
              ) : (
                reports.map((r) => (
                  <div key={`${r.kind}-${r.id}`} className="moderation-report-card">
                    <div className="moderation-report-meta">
                      <span className="moderation-report-kind">
                        {r.kind === "message" ? "💬 Message" : "👥 Conversation"}
                      </span>
                      <span>{new Date(r.created_at).toLocaleString()}</span>
                    </div>
                    <div className="moderation-report-reason">"{r.reason}"</div>
                    <div className="moderation-report-context">
                      Reported by <b>{r.reporter.username}</b>
                      {r.kind === "message" ? (
                        <> — message by <b>{r.message.sender}</b>:{" "}
                          {r.message.is_deleted
                            ? <i>[already deleted]</i>
                            : <span>"{r.message.content}"</span>}
                        </>
                      ) : (
                        <> — group/channel <b>{r.conversation.name}</b></>
                      )}
                    </div>
                    {!r.resolved && (
                      <div className="moderation-report-actions">
                        {r.kind === "message" && !r.message.is_deleted && (
                          <button className="danger" onClick={() => deleteReportedMessage(r)}>
                            Delete message
                          </button>
                        )}
                        <button onClick={() => resolveReport(r)}>Mark resolved</button>
                      </div>
                    )}
                  </div>
                ))
              )}
            </>
          )}

          {tab === "words" && (
            <>
              <div className="moderation-add-word">
                <input
                  type="text"
                  placeholder="Add a word…"
                  value={newWord}
                  onChange={(e) => setNewWord(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addWord()}
                />
                <button onClick={addWord} disabled={!newWord.trim()}>Add</button>
              </div>

              {loading ? (
                <div className="moderation-empty">Loading…</div>
              ) : words.length === 0 ? (
                <div className="moderation-empty">No banned words yet</div>
              ) : (
                <div className="moderation-word-list">
                  {words.map((w) => (
                    <div key={w.id} className="moderation-word-chip">
                      {w.word}
                      <button onClick={() => removeWord(w)} title="Remove">×</button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
    )}
    {confirmDialog && (
      <ConfirmModal
        {...confirmDialog}
        onCancel={() => setConfirmDialog(null)}
        onConfirm={() => { confirmDialog.onConfirm(); setConfirmDialog(null) }}
      />
    )}
  </>
}

export default ModerationPanel
