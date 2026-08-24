import api from "../api/axios"

export function isPushSupported() {
  return "serviceWorker" in navigator && "PushManager" in window
}

export async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return null
  return navigator.serviceWorker.register("/sw.js")
}

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/")
  const rawData = atob(base64)
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)))
}

export async function subscribeToPush() {
  if (!isPushSupported()) {
    throw new Error("Push notifications aren't supported in this browser")
  }

  const permission = await Notification.requestPermission()
  if (permission !== "granted") return null

  const publicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY
  if (!publicKey) {
    throw new Error("VITE_VAPID_PUBLIC_KEY is not configured")
  }

  const registration = await registerServiceWorker()
  await navigator.serviceWorker.ready

  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey),
  })

  await api.post("/notifications/push/subscribe/", subscription.toJSON())
  return subscription
}

export async function unsubscribeFromPush() {
  if (!("serviceWorker" in navigator)) return
  const registration = await navigator.serviceWorker.getRegistration()
  const subscription = await registration?.pushManager.getSubscription()
  if (!subscription) return

  await api.post("/notifications/push/unsubscribe/", { endpoint: subscription.endpoint })
  await subscription.unsubscribe()
}

export async function getPushSubscription() {
  if (!("serviceWorker" in navigator)) return null
  const registration = await navigator.serviceWorker.getRegistration()
  return (await registration?.pushManager.getSubscription()) || null
}
