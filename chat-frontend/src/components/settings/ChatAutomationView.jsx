import { useState } from "react"
import toast from "react-hot-toast"
import { getAutomationSettings, setAutomationSettings } from "../../utils/chatAutomation"
import "./ChatAutomationView.css"

// UI-only settings screen — this app has no bot platform integration, so
// nothing here actually connects to or forwards messages to a bot. The
// bot handle and access-mode choice are saved locally so the screen isn't
// purely cosmetic; "Exclude Chats" has no real chat-picker behind it yet.
function ChatAutomationView({ onBack }) {
  const [settings, setSettings] = useState(getAutomationSettings())

  const update = (patch) => {
    const next = { ...settings, ...patch }
    setSettings(next)
    setAutomationSettings(next)
  }

  return (
    <>
      <div className="settings-modal-topbar">
        <button className="settings-back-btn" onClick={onBack}>←</button>
        <h2>Chat Automation</h2>
        <div className="settings-modal-topbar-actions" />
      </div>

      <div className="automation-intro">
        <div className="automation-icon">🤖</div>
        <p>Add a bot to answer messages on your behalf.</p>
      </div>

      <div className="settings-list">
        <input
          type="text"
          className="automation-bot-input"
          placeholder="Enter bot URL or username"
          value={settings.botHandle}
          onChange={(e) => update({ botHandle: e.target.value })}
        />
      </div>
      <div className="settings-list-section-label">Choose a bot to manage your chats automatically.</div>

      <div className="settings-list-section-label">Chats the bot can access</div>
      <div className="settings-list">
        <button
          className="settings-list-item language-list-item"
          onClick={() => update({ accessMode: "all_except" })}
        >
          <span className={`language-radio ${settings.accessMode === "all_except" ? "active" : ""}`} />
          <span className="settings-list-item-text"><span>All Private Chats Except...</span></span>
        </button>
        <button
          className="settings-list-item language-list-item"
          onClick={() => update({ accessMode: "selected_only" })}
        >
          <span className={`language-radio ${settings.accessMode === "selected_only" ? "active" : ""}`} />
          <span className="settings-list-item-text"><span>Only Selected Chats</span></span>
        </button>
      </div>

      <div className="settings-list-section-label">Excluded chats</div>
      <div className="settings-list">
        <button
          className="settings-list-item"
          onClick={() => toast("Chat selection — coming soon", { icon: "🚧" })}
        >
          <span className="automation-exclude-icon">−</span>
          <span>Exclude Chats</span>
        </button>
      </div>
      <div className="settings-list-section-label">
        Select chats or entire chat categories which the bot will not have access to.
      </div>
    </>
  )
}

export default ChatAutomationView
