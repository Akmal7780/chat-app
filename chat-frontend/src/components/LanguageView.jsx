import { useState } from "react"
import toast from "react-hot-toast"
import { getLanguagePrefs, setLanguagePrefs } from "../utils/languagePrefs"
import { useLanguage } from "../utils/i18n"

const LANGUAGES = [
  { code: "en", nameKey: "language_name_en" },
  { code: "ru", nameKey: "language_name_ru" },
]

function LanguageView({ onBack }) {
  const [search, setSearch] = useState("")
  const [prefs, setPrefs] = useState(() => getLanguagePrefs())
  const { t, lang, setLang } = useLanguage()

  const handleComingSoon = (label) => {
    toast(`${label} — coming soon`, { icon: "🚧" })
  }

  const toggleShowTranslateButton = () => {
    setPrefs(setLanguagePrefs({ showTranslateButton: !prefs.showTranslateButton }))
  }

  const filtered = LANGUAGES.filter((l) =>
    t(l.nameKey).toLowerCase().includes(search.toLowerCase())
  )

  return (
    <>
      <div className="settings-modal-topbar">
        <button className="settings-back-btn" onClick={onBack}>←</button>
        <h2>{t("language_title")}</h2>
        <div className="settings-modal-topbar-actions" />
      </div>

      <div className="settings-list">
        <div className="settings-list-item settings-list-toggle">
          <span>{t("language_showTranslateButton")}</span>
          <label className="settings-switch">
            <input
              type="checkbox"
              checked={prefs.showTranslateButton}
              onChange={toggleShowTranslateButton}
            />
            <span className="settings-switch-slider" />
          </label>
        </div>

        <button
          className="settings-list-item settings-list-toggle"
          onClick={() => handleComingSoon(t("language_translateEntireChats"))}
        >
          <span>🔒 {t("language_translateEntireChats")}</span>
          <label className="settings-switch">
            <input type="checkbox" checked={false} disabled readOnly />
            <span className="settings-switch-slider" />
          </label>
        </button>
      </div>

      <p className="language-hint">{t("language_hint")}</p>

      <div className="language-search">
        <input
          type="text"
          placeholder={t("language_search")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="settings-list">
        {filtered.map((l) => (
          <button
            key={l.code}
            className="settings-list-item language-list-item"
            onClick={() => setLang(l.code)}
          >
            <span className={`language-radio ${l.code === lang ? "active" : ""}`} />
            <span className="settings-list-item-text">
              <span>{t(l.nameKey)}</span>
            </span>
          </button>
        ))}
      </div>
    </>
  )
}

export default LanguageView
