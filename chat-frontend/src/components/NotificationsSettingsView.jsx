import { useEffect, useState } from "react"
import toast from "react-hot-toast"
import { getNotificationPrefs, setNotificationPrefs } from "../utils/notificationPrefs"
import { requestDesktopPermission, playNotificationSound } from "../utils/notify"
import { isPushSupported, subscribeToPush, unsubscribeFromPush, getPushSubscription } from "../utils/push"

function NotificationsSettingsView({ onBack }) {
  const [prefs, setPrefs] = useState(() => getNotificationPrefs())
  const [pushEnabled, setPushEnabled] = useState(false)
  const [pushBusy, setPushBusy] = useState(false)

  useEffect(() => {
    getPushSubscription().then((sub) => setPushEnabled(!!sub))
  }, [])

  const handlePushToggle = async () => {
    setPushBusy(true)
    try {
      if (pushEnabled) {
        await unsubscribeFromPush()
        setPushEnabled(false)
      } else {
        const sub = await subscribeToPush()
        if (!sub) {
          toast.error("Notification permission was not granted")
        } else {
          setPushEnabled(true)
          toast.success("Push notifications enabled")
        }
      }
    } catch (err) {
      console.error("Push toggle error:", err)
      toast.error(err.message || "Could not update push notifications")
    } finally {
      setPushBusy(false)
    }
  }

  const update = (patch) => {
    setPrefs(setNotificationPrefs(patch))
  }

  const handleDesktopToggle = async () => {
    if (!prefs.desktopEnabled) {
      const granted = await requestDesktopPermission()
      if (!granted) {
        toast.error("Browser notification permission was not granted")
        return
      }
    }
    update({ desktopEnabled: !prefs.desktopEnabled })
  }

  const handleSoundToggle = () => {
    const next = !prefs.soundEnabled
    update({ soundEnabled: next })
    if (next) playNotificationSound(prefs.volume)
  }

  const handleVolumeChange = (value) => {
    update({ volume: value })
  }

  return (
    <>
      <div className="settings-modal-topbar">
        <button className="settings-back-btn" onClick={onBack}>←</button>
        <h2>Notifications and Sounds</h2>
        <div className="settings-modal-topbar-actions" />
      </div>

      <div className="settings-list">
        <div className="settings-list-section-label">Global settings</div>

        <div className="settings-list-item settings-list-toggle">
          <span className="settings-list-icon">🖥️</span>
          <div className="settings-list-item-text">
            <span>Desktop notifications</span>
            <small>Shows a browser notification when a message arrives while this tab isn't focused</small>
          </div>
          <label className="settings-switch">
            <input type="checkbox" checked={prefs.desktopEnabled} onChange={handleDesktopToggle} />
            <span className="settings-switch-slider" />
          </label>
        </div>

        {isPushSupported() && (
          <div className="settings-list-item settings-list-toggle">
            <span className="settings-list-icon">📲</span>
            <div className="settings-list-item-text">
              <span>Push notifications</span>
              <small>Real notifications even when this tab or browser is closed</small>
            </div>
            <label className="settings-switch">
              <input
                type="checkbox"
                checked={pushEnabled}
                disabled={pushBusy}
                onChange={handlePushToggle}
              />
              <span className="settings-switch-slider" />
            </label>
          </div>
        )}

        <div className="settings-list-item settings-list-toggle">
          <span className="settings-list-icon">🔠</span>
          <div className="settings-list-item-text">
            <span>Flash tab title</span>
            <small>Blinks the browser tab title on new messages while unfocused</small>
          </div>
          <label className="settings-switch">
            <input
              type="checkbox"
              checked={prefs.flashTitleEnabled}
              onChange={() => update({ flashTitleEnabled: !prefs.flashTitleEnabled })}
            />
            <span className="settings-switch-slider" />
          </label>
        </div>

        <div className="settings-list-item settings-list-toggle">
          <span className="settings-list-icon">🔊</span>
          <span>Allow sound</span>
          <label className="settings-switch">
            <input type="checkbox" checked={prefs.soundEnabled} onChange={handleSoundToggle} />
            <span className="settings-switch-slider" />
          </label>
        </div>

        <div className="settings-volume-row">
          <span className="settings-list-icon">🔈</span>
          <input
            type="range"
            min="0"
            max="100"
            value={prefs.volume}
            disabled={!prefs.soundEnabled}
            onChange={(e) => handleVolumeChange(Number(e.target.value))}
            onMouseUp={() => playNotificationSound(prefs.volume)}
          />
          <span className="settings-volume-value">{prefs.volume}%</span>
        </div>
      </div>

      <div className="settings-list">
        <div className="settings-list-section-label">Notifications for chats</div>

        <div className="settings-list-item settings-list-toggle">
          <span className="settings-list-icon">👤</span>
          <span>Private chats</span>
          <label className="settings-switch">
            <input
              type="checkbox"
              checked={prefs.notifyPrivate}
              onChange={() => update({ notifyPrivate: !prefs.notifyPrivate })}
            />
            <span className="settings-switch-slider" />
          </label>
        </div>

        <div className="settings-list-item settings-list-toggle">
          <span className="settings-list-icon">👥</span>
          <span>Groups</span>
          <label className="settings-switch">
            <input
              type="checkbox"
              checked={prefs.notifyGroups}
              onChange={() => update({ notifyGroups: !prefs.notifyGroups })}
            />
            <span className="settings-switch-slider" />
          </label>
        </div>
      </div>
    </>
  )
}

export default NotificationsSettingsView
