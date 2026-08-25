import { createPortal } from "react-dom"
import "./ConfirmModal.css"

// Shared confirmation dialog — replaces window.confirm() with the app's own
// .poll-modal shell so it matches the UI instead of the browser's native prompt.
function ConfirmModal({ title = "Confirm", message, confirmLabel = "OK", cancelLabel = "Cancel", danger = false, onConfirm, onCancel }) {
  return createPortal(
    <div className="poll-modal-overlay" onClick={onCancel}>
      <div className="poll-modal confirm-modal" onClick={(e) => e.stopPropagation()}>
        <div className="poll-modal-header">
          <h3>{title}</h3>
        </div>
        <div className="poll-modal-body">
          <p className="confirm-modal-message">{message}</p>
        </div>
        <div className="poll-modal-footer">
          <button className="poll-cancel-btn" onClick={onCancel}>{cancelLabel}</button>
          <button className={`poll-submit-btn ${danger ? "danger" : ""}`} onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>,
    document.body
  )
}

export default ConfirmModal
