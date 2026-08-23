import { useEffect, useState } from "react"
import toast from "react-hot-toast"
import api from "../api/axios"
import BlockedUsersView from "./BlockedUsersView"
import ActiveSessionsView from "./ActiveSessionsView"
import TwoStepVerificationView from "./TwoStepVerificationView"
import LocalPasscodeView from "./LocalPasscodeView"
import { hasPasscode } from "../utils/localPasscode"

const SECURITY_ITEMS = [
  { icon: "🔑", label: "Passkeys", value: "Off" },
  { icon: "🌐", label: "Connected websites", value: "0" },
]

const PRIVACY_ITEMS = [
  { icon: "📞", label: "Phone number", value: "Nobody" },
  { icon: "👁️", label: "Last seen & online", value: "Everybody" },
  { icon: "🖼️", label: "Profile photos", value: "My contacts" },
  { icon: "↪️", label: "Forwarded messages", value: "Everybody" },
  { icon: "📹", label: "Calls", value: "Everybody" },
  { icon: "🎤", label: "Voice messages", value: "Everybody" },
  { icon: "💬", label: "Messages", value: "Everybody" },
  { icon: "🎂", label: "Birthday", value: "My contacts" },
  { icon: "🎁", label: "Gifts", value: "Everybody" },
  { icon: "📝", label: "Bio", value: "Everybody" },
  { icon: "🎵", label: "Saved Music", value: "Everybody" },
  { icon: "✉️", label: "Invites", value: "Nobody" },
]

function PrivacySecurityView({ onBack }) {
  const [showBlocked, setShowBlocked] = useState(false)
  const [showSessions, setShowSessions] = useState(false)
  const [showTwoStep, setShowTwoStep] = useState(false)
  const [showPasscode, setShowPasscode] = useState(false)
  const [blockedCount, setBlockedCount] = useState(null)
  const [sessionCount, setSessionCount] = useState(null)
  const [twoStepEnabled, setTwoStepEnabled] = useState(null)
  const [passcodeEnabled, setPasscodeEnabled] = useState(hasPasscode())

  useEffect(() => {
    api.get("/users/blocked/")
      .then((res) => setBlockedCount((res.data.results || res.data).length))
      .catch((err) => console.error("Blocked users count error:", err))
  }, [showBlocked])

  useEffect(() => {
    api.get("/users/sessions/")
      .then((res) => setSessionCount(res.data.length))
      .catch((err) => console.error("Sessions count error:", err))
  }, [showSessions])

  useEffect(() => {
    api.get("/users/2fa/status/")
      .then((res) => setTwoStepEnabled(res.data.enabled))
      .catch((err) => console.error("2FA status error:", err))
  }, [showTwoStep])

  const handleComingSoon = (label) => {
    toast(`${label} — coming soon`, { icon: "🚧" })
  }

  if (showBlocked) {
    return <BlockedUsersView onBack={() => setShowBlocked(false)} />
  }

  if (showSessions) {
    return <ActiveSessionsView onBack={() => setShowSessions(false)} />
  }

  if (showTwoStep) {
    return <TwoStepVerificationView onBack={() => setShowTwoStep(false)} />
  }

  if (showPasscode) {
    return <LocalPasscodeView onBack={() => { setShowPasscode(false); setPasscodeEnabled(hasPasscode()) }} />
  }

  return (
    <>
      <div className="settings-modal-topbar">
        <button className="settings-back-btn" onClick={onBack}>←</button>
        <h2>Privacy and Security</h2>
        <div className="settings-modal-topbar-actions" />
      </div>

      <div className="settings-list">
        <div className="settings-list-section-label">Security</div>

        <button className="settings-list-item" onClick={() => setShowTwoStep(true)}>
          <span className="settings-list-icon">🛡️</span>
          <span>Two-Step Verification</span>
          <span className="settings-list-value">{twoStepEnabled == null ? "…" : twoStepEnabled ? "On" : "Off"}</span>
        </button>

        <button className="settings-list-item" onClick={() => setShowPasscode(true)}>
          <span className="settings-list-icon">🔒</span>
          <span>Local passcode</span>
          <span className="settings-list-value">{passcodeEnabled ? "On" : "Off"}</span>
        </button>

        {SECURITY_ITEMS.map(({ icon, label, value }) => (
          <button
            key={label}
            className="settings-list-item"
            onClick={() => handleComingSoon(label)}
          >
            <span className="settings-list-icon">{icon}</span>
            <span>{label}</span>
            <span className="settings-list-value">{value}</span>
          </button>
        ))}

        <button className="settings-list-item" onClick={() => setShowBlocked(true)}>
          <span className="settings-list-icon">✋</span>
          <span>Blocked users</span>
          <span className="settings-list-value">{blockedCount ?? "…"}</span>
        </button>

        <button className="settings-list-item" onClick={() => setShowSessions(true)}>
          <span className="settings-list-icon">💻</span>
          <span>Active sessions</span>
          <span className="settings-list-value">{sessionCount ?? "…"}</span>
        </button>
      </div>

      <div className="settings-list">
        <div className="settings-list-section-label">Privacy</div>
        {PRIVACY_ITEMS.map(({ icon, label, value }) => (
          <button
            key={label}
            className="settings-list-item"
            onClick={() => handleComingSoon(label)}
          >
            <span className="settings-list-icon">{icon}</span>
            <span>{label}</span>
            <span className="settings-list-value">{value}</span>
          </button>
        ))}
      </div>
    </>
  )
}

export default PrivacySecurityView
