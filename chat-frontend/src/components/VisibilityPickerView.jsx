import { useState } from "react"
import api from "../api/axios"
import { useLanguage } from "../utils/i18n"

// Shared "Everybody / Nobody" privacy picker — used for both "Last seen &
// online" and "Profile photos" in PrivacySecurityView. Persists via the same
// PATCH /users/profile/update/ endpoint ProfileEdit.jsx uses; `field` is
// either "last_seen_visibility" or "avatar_visibility" on the User model
// (see UserSerializer.get_last_seen/get_avatar_url for how it's enforced).
function VisibilityPickerView({ titleKey, field, value, onBack, onChanged }) {
  const { t } = useLanguage()
  const [current, setCurrent] = useState(value || "everyone")
  const [saving, setSaving] = useState(false)

  const OPTIONS = [
    { value: "everyone", labelKey: "privacy_everybody" },
    { value: "nobody", labelKey: "privacy_nobody" },
  ]

  const handleSelect = async (optionValue) => {
    if (optionValue === current || saving) return
    setSaving(true)
    try {
      await api.patch("/users/profile/update/", { [field]: optionValue })
      setCurrent(optionValue)
      onChanged?.(optionValue)
    } catch (err) {
      console.error("Privacy update error:", err)
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div className="settings-modal-topbar">
        <button className="settings-back-btn" onClick={onBack}>←</button>
        <h2>{t(titleKey)}</h2>
        <div className="settings-modal-topbar-actions" />
      </div>

      <div className="settings-list">
        {OPTIONS.map((opt) => (
          <button
            key={opt.value}
            className="settings-list-item language-list-item"
            onClick={() => handleSelect(opt.value)}
            disabled={saving}
          >
            <span className={`language-radio ${opt.value === current ? "active" : ""}`} />
            <span className="settings-list-item-text">
              <span>{t(opt.labelKey)}</span>
            </span>
          </button>
        ))}
      </div>
    </>
  )
}

export default VisibilityPickerView
