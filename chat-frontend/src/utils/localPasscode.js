const HASH_KEY = "chat_local_passcode_hash"
const LOCKED_KEY = "chat_local_passcode_locked"
const LOCK_EVENT = "app:lock"

async function sha256(text) {
  const enc = new TextEncoder().encode(text)
  const digest = await crypto.subtle.digest("SHA-256", enc)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("")
}

export function hasPasscode() {
  return !!localStorage.getItem(HASH_KEY)
}

export async function setPasscode(code) {
  localStorage.setItem(HASH_KEY, await sha256(code))
}

export function clearPasscode() {
  localStorage.removeItem(HASH_KEY)
  localStorage.removeItem(LOCKED_KEY)
}

export async function verifyPasscode(code) {
  const stored = localStorage.getItem(HASH_KEY)
  return !!stored && (await sha256(code)) === stored
}

export function isLocked() {
  return hasPasscode() && localStorage.getItem(LOCKED_KEY) === "true"
}

// Locking is triggered from deep inside the sidebar (FolderRail); the
// overlay itself is mounted once at the App root, so a same-tab custom
// event is the simplest way across without threading a prop/context
// through the whole tree just for this one cross-cutting action.
export function lock() {
  if (!hasPasscode()) return
  localStorage.setItem(LOCKED_KEY, "true")
  window.dispatchEvent(new Event(LOCK_EVENT))
}

export function unlock() {
  localStorage.removeItem(LOCKED_KEY)
}

export function onLockRequested(handler) {
  window.addEventListener(LOCK_EVENT, handler)
  return () => window.removeEventListener(LOCK_EVENT, handler)
}
