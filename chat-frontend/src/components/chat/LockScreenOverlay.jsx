import { useState } from "react"
import { verifyPasscode, unlock } from "../../utils/localPasscode"
import "./LockScreenOverlay.css"

function LockScreenOverlay({ onUnlocked }) {
  const [code, setCode] = useState("")
  const [error, setError] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    const ok = await verifyPasscode(code)
    if (ok) {
      unlock()
      onUnlocked()
    } else {
      setError(true)
      setCode("")
    }
  }

  return (
    <div className="lock-screen-overlay">
      <form className="lock-screen-card" onSubmit={handleSubmit}>
        <div className="lock-screen-icon">🔒</div>
        <h2>Enter Passcode</h2>
        <p>Your chats are locked with a local passcode.</p>
        <input
          type="password"
          inputMode="numeric"
          className={`lock-screen-input ${error ? "error" : ""}`}
          value={code}
          onChange={(e) => { setCode(e.target.value); setError(false) }}
          autoFocus
          placeholder="Passcode"
        />
        {error && <span className="lock-screen-error">Incorrect passcode</span>}
        <button type="submit" className="lock-screen-submit">Unlock</button>
      </form>
    </div>
  )
}

export default LockScreenOverlay
