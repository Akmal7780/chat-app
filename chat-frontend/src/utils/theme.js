const STORAGE_KEY = "chat_theme"
const AUTO_NIGHT_KEY = "chat_theme_auto_night"

export const VALID_THEMES = ["light", "day", "tinted", "dark"]
export const DARK_FAMILY_THEMES = ["dark", "tinted"]

export function getTheme() {
  const stored = localStorage.getItem(STORAGE_KEY)
  return VALID_THEMES.includes(stored) ? stored : "light"
}

export function applyTheme(theme) {
  if (theme === "light") {
    document.documentElement.removeAttribute("data-theme")
  } else {
    document.documentElement.setAttribute("data-theme", theme)
  }
  localStorage.setItem(STORAGE_KEY, theme)
}

export function isDarkFamily(theme) {
  return DARK_FAMILY_THEMES.includes(theme)
}

export function getAutoNightMode() {
  return localStorage.getItem(AUTO_NIGHT_KEY) === "true"
}

function applySystemTheme() {
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches
  applyTheme(prefersDark ? "dark" : "light")
}

export function setAutoNightMode(enabled) {
  localStorage.setItem(AUTO_NIGHT_KEY, String(enabled))
  if (enabled) applySystemTheme()
}

// Registered once at app startup (see main.jsx) — while auto-night-mode is
// on, following the OS light/dark preference is the "real" behavior instead
// of a fake always-on toggle.
export function initAutoNightModeListener() {
  if (typeof window === "undefined" || !window.matchMedia) return
  const media = window.matchMedia("(prefers-color-scheme: dark)")
  const handler = () => {
    if (getAutoNightMode()) applySystemTheme()
  }
  media.addEventListener("change", handler)
  if (getAutoNightMode()) applySystemTheme()
}
