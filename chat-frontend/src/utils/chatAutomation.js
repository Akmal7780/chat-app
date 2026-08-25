// Client-side only — no bot platform integration exists in this app yet.
// Persists the user's chosen settings so the screen isn't purely cosmetic,
// without pretending to actually connect or forward messages to a bot.
const KEY = "chat_automation_settings"

const DEFAULTS = { botHandle: "", accessMode: "all_except" }

export function getAutomationSettings() {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY)) }
  } catch {
    return { ...DEFAULTS }
  }
}

export function setAutomationSettings(settings) {
  localStorage.setItem(KEY, JSON.stringify(settings))
}
