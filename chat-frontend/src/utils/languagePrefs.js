const KEY = "chat_language_prefs"

const DEFAULTS = {
  showTranslateButton: false,
}

export function getLanguagePrefs() {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { ...DEFAULTS }
    return { ...DEFAULTS, ...JSON.parse(raw) }
  } catch {
    return { ...DEFAULTS }
  }
}

export function setLanguagePrefs(patch) {
  const next = { ...getLanguagePrefs(), ...patch }
  localStorage.setItem(KEY, JSON.stringify(next))
  return next
}
