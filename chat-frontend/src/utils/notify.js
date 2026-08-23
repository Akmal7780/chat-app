// Desktop notification, notification sound, and tab-title-flash helpers.
// No external assets/permissions beyond the standard browser Notification
// API and Web Audio API — nothing is requested until the user opts in via
// Settings → Notifications and Sounds.

export async function requestDesktopPermission() {
  if (!("Notification" in window)) return false
  if (Notification.permission === "granted") return true
  if (Notification.permission === "denied") return false

  const result = await Notification.requestPermission()
  return result === "granted"
}

export function showDesktopNotification(title, body) {
  if (!("Notification" in window)) return
  if (Notification.permission !== "granted") return
  if (document.visibilityState === "visible") return // only when the tab isn't focused

  try {
    const n = new Notification(title, { body, tag: "chat-app-message" })
    n.onclick = () => {
      window.focus()
      n.close()
    }
  } catch (err) {
    console.error("Desktop notification error:", err)
  }
}

let audioCtx = null

// A short two-tone "ping" synthesized with the Web Audio API — avoids
// bundling/licensing an actual sound asset.
export function playNotificationSound(volumePercent) {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)()
    if (audioCtx.state === "suspended") audioCtx.resume()

    const gain = audioCtx.createGain()
    gain.gain.value = Math.max(0, Math.min(1, volumePercent / 100)) * 0.2
    gain.connect(audioCtx.destination)

    const playTone = (freq, startOffset, duration) => {
      const osc = audioCtx.createOscillator()
      osc.type = "sine"
      osc.frequency.value = freq
      osc.connect(gain)
      const start = audioCtx.currentTime + startOffset
      osc.start(start)
      osc.stop(start + duration)
    }

    playTone(880, 0, 0.1)
    playTone(1320, 0.1, 0.12)
  } catch (err) {
    console.error("Notification sound error:", err)
  }
}

let flashInterval = null
const ORIGINAL_TITLE = document.title

export function flashTitle(message) {
  if (document.visibilityState === "visible") return
  if (flashInterval) return

  let showingAlert = true
  flashInterval = setInterval(() => {
    document.title = showingAlert ? message : ORIGINAL_TITLE
    showingAlert = !showingAlert
  }, 1000)

  const stop = () => {
    clearInterval(flashInterval)
    flashInterval = null
    document.title = ORIGINAL_TITLE
    document.removeEventListener("visibilitychange", stop)
    window.removeEventListener("focus", stop)
  }

  document.addEventListener("visibilitychange", stop)
  window.addEventListener("focus", stop)
}
