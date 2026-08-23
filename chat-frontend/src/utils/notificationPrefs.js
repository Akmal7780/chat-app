const KEY = "chat_notification_prefs"

const DEFAULTS = {
  desktopEnabled: false, // starts off — needs an explicit opt-in (Notification permission prompt)
  flashTitleEnabled: true,
  soundEnabled: true,
  volume: 80,
  notifyPrivate: true,
  notifyGroups: true,
}

export function getNotificationPrefs() {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { ...DEFAULTS }
    return { ...DEFAULTS, ...JSON.parse(raw) }
  } catch {
    return { ...DEFAULTS }
  }
}

export function setNotificationPrefs(patch) {
  const next = { ...getNotificationPrefs(), ...patch }
  localStorage.setItem(KEY, JSON.stringify(next))
  return next
}
