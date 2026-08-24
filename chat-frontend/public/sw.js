// Nexus Chat service worker — Web Push + PWA installability.
// Deliberately minimal: no offline caching (this is a live real-time app;
// stale cached data would be actively wrong), just push handling and enough
// of a fetch handler for browsers to consider the app installable.

self.addEventListener("install", () => {
  self.skipWaiting()
})

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim())
})

// Required for PWA installability criteria — pass-through, no caching.
self.addEventListener("fetch", () => {})

self.addEventListener("push", (event) => {
  if (!event.data) return

  let payload
  try {
    payload = event.data.json()
  } catch {
    payload = { title: "Nexus Chat", body: event.data.text() }
  }

  const { title, body, conversation_id: conversationId } = payload

  event.waitUntil(
    (async () => {
      // Don't double-notify — if any window of the app is already visible
      // and focused, the in-page toast/sound already covers it.
      const clientList = await self.clients.matchAll({ type: "window", includeUncontrolled: true })
      const hasFocusedClient = clientList.some((client) => client.focused)
      if (hasFocusedClient) return

      await self.registration.showNotification(title || "Nexus Chat", {
        body,
        icon: "/vite.svg",
        badge: "/vite.svg",
        tag: conversationId ? `conversation-${conversationId}` : undefined,
        data: { conversationId },
      })
    })()
  )
})

self.addEventListener("notificationclick", (event) => {
  event.notification.close()
  const conversationId = event.notification.data?.conversationId

  event.waitUntil(
    (async () => {
      const clientList = await self.clients.matchAll({ type: "window", includeUncontrolled: true })
      const target = clientList[0]

      if (target) {
        target.focus()
        target.postMessage({ type: "push-notification-click", conversationId })
      } else {
        self.clients.openWindow("/chat")
      }
    })()
  )
})
