import { useEffect, useState } from "react"
import toast from "react-hot-toast"
import api from "../../api/axios"
import BlockedUsersView from "./BlockedUsersView"
import ActiveSessionsView from "./ActiveSessionsView"
import TwoStepVerificationView from "./TwoStepVerificationView"
import LocalPasscodeView from "./LocalPasscodeView"
import VisibilityPickerView from "./VisibilityPickerView"
import { hasPasscode } from "../../utils/localPasscode"
import { useLanguage } from "../../utils/i18n"

const SECURITY_ITEMS = [
  { icon: "🔑", label: "Passkeys", value: "Off" },
  { icon: "🌐", label: "Connected websites", value: "0" },
]

// Items with no matching feature/data anywhere in this app (no gifts or
// saved-music concept exists) — left as "coming soon" rather than wired to
// a fake setting.
const FAKE_PRIVACY_ITEMS = [
  { icon: "🎁", label: "Gifts", value: "Everybody" },
  { icon: "🎵", label: "Saved Music", value: "Everybody" },
]

// Real, enforced Everybody/Nobody settings — see User.*_visibility fields
// and UserSerializer / ConversationViewSet.create / handle_call_signal /
// complete_upload / add_member / MessageSerializer.get_forwarded_from for
// where each one is actually applied server-side.
const REAL_PRIVACY_ITEMS = [
  { icon: "👁️", field: "last_seen_visibility", titleKey: "privacy_lastSeen", descKey: "privacy_lastSeen_desc" },
  { icon: "🖼️", field: "avatar_visibility", titleKey: "privacy_profilePhotos", descKey: "privacy_profilePhotos_desc" },
  { icon: "📝", field: "bio_visibility", titleKey: "privacy_bio", descKey: "privacy_bio_desc" },
  { icon: "💬", field: "messages_visibility", titleKey: "privacy_messages", descKey: "privacy_messages_desc" },
  { icon: "📹", field: "calls_visibility", titleKey: "privacy_calls", descKey: "privacy_calls_desc" },
  { icon: "🎤", field: "voice_messages_visibility", titleKey: "privacy_voiceMessages", descKey: "privacy_voiceMessages_desc" },
  { icon: "✉️", field: "invites_visibility", titleKey: "privacy_invites", descKey: "privacy_invites_desc" },
  { icon: "↪️", field: "forwarded_messages_visibility", titleKey: "privacy_forwardedMessages", descKey: "privacy_forwardedMessages_desc" },
  { icon: "📞", field: "phone_visibility", titleKey: "privacy_phoneNumber", descKey: "privacy_phoneNumber_desc" },
  { icon: "🎂", field: "birthday_visibility", titleKey: "privacy_birthday", descKey: "privacy_birthday_desc" },
]

function PrivacySecurityView({ onBack }) {
  const { t } = useLanguage()
  const [showBlocked, setShowBlocked] = useState(false)
  const [showSessions, setShowSessions] = useState(false)
  const [showTwoStep, setShowTwoStep] = useState(false)
  const [showPasscode, setShowPasscode] = useState(false)
  const [activeField, setActiveField] = useState(null)
  const [blockedCount, setBlockedCount] = useState(null)
  const [sessionCount, setSessionCount] = useState(null)
  const [twoStepEnabled, setTwoStepEnabled] = useState(null)
  const [passcodeEnabled, setPasscodeEnabled] = useState(hasPasscode())
  const [privacyValues, setPrivacyValues] = useState({})

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

  useEffect(() => {
    api.get("/users/users/me/")
      .then((res) => {
        const values = {}
        REAL_PRIVACY_ITEMS.forEach(({ field }) => {
          values[field] = res.data[field] || "everyone"
        })
        setPrivacyValues(values)
      })
      .catch((err) => console.error("Privacy settings fetch error:", err))
  }, [])

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

  if (activeField) {
    const item = REAL_PRIVACY_ITEMS.find((i) => i.field === activeField)
    return (
      <VisibilityPickerView
        titleKey={item.titleKey}
        descriptionKey={item.descKey}
        field={item.field}
        value={privacyValues[item.field]}
        onChanged={(v) => setPrivacyValues((prev) => ({ ...prev, [item.field]: v }))}
        onBack={() => setActiveField(null)}
      />
    )
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

        {REAL_PRIVACY_ITEMS.map(({ icon, field, titleKey }) => (
          <button key={field} className="settings-list-item" onClick={() => setActiveField(field)}>
            <span className="settings-list-icon">{icon}</span>
            <span>{t(titleKey)}</span>
            <span className="settings-list-value">
              {privacyValues[field] === "nobody" ? t("privacy_nobody") : t("privacy_everybody")}
            </span>
          </button>
        ))}

        {FAKE_PRIVACY_ITEMS.map(({ icon, label, value }) => (
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
