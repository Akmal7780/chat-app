const STORAGE_KEY = "chat_accent_color"

export function getAccentColor() {
  return localStorage.getItem(STORAGE_KEY) || null
}

// Overrides --indigo-accent as an inline style on <html>, which wins over
// both :root and :root[data-theme=...] — so the chosen color persists
// across theme switches until cleared (color === null).
export function applyAccentColor(color) {
  if (color) {
    document.documentElement.style.setProperty("--indigo-accent", color)
    localStorage.setItem(STORAGE_KEY, color)
  } else {
    document.documentElement.style.removeProperty("--indigo-accent")
    localStorage.removeItem(STORAGE_KEY)
  }
}
