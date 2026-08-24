const PREFIX = "chat_draft_"

export function getDraft(conversationId) {
  if (!conversationId) return ""
  try {
    return localStorage.getItem(PREFIX + conversationId) || ""
  } catch {
    return ""
  }
}

// Notifies same-tab listeners (e.g. ChatsList's "Draft: ..." preview) since
// localStorage's own "storage" event only fires in *other* tabs.
export function setDraft(conversationId, text) {
  if (!conversationId) return
  try {
    if (text && text.trim()) {
      localStorage.setItem(PREFIX + conversationId, text)
    } else {
      localStorage.removeItem(PREFIX + conversationId)
    }
  } catch {
    // ignore (private browsing / storage disabled)
  }
  window.dispatchEvent(new CustomEvent("draft-updated", { detail: { conversationId } }))
}

export function clearDraft(conversationId) {
  setDraft(conversationId, "")
}

export function onDraftUpdated(callback) {
  const handler = (e) => callback(e.detail?.conversationId)
  window.addEventListener("draft-updated", handler)
  return () => window.removeEventListener("draft-updated", handler)
}
