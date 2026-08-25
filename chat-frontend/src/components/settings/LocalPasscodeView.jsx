import { useState } from "react"
import toast from "react-hot-toast"
import { hasPasscode, setPasscode, clearPasscode, lock } from "../../utils/localPasscode"
import "./TwoStepVerificationView.css"
import "./LocalPasscodeView.css"

function LocalPasscodeView({ onBack }) {
  const [step, setStep] = useState(hasPasscode() ? "manage" : "create")
  const [code, setCode] = useState("")
  const [confirmCode, setConfirmCode] = useState("")
  const [saving, setSaving] = useState(false)

  const goCreateStep = () => {
    setCode("")
    setConfirmCode("")
    setStep("create")
  }

  const handleSave = async () => {
    if (!/^\d{4}$/.test(code)) {
      toast.error("Passcode must be exactly 4 digits")
      return
    }
    if (code !== confirmCode) {
      toast.error("Passcodes do not match")
      return
    }

    setSaving(true)
    try {
      await setPasscode(code)
      toast.success("Local passcode set")
      setStep("manage")
    } finally {
      setSaving(false)
    }
  }

  const handleTurnOff = () => {
    clearPasscode()
    toast.success("Local passcode turned off")
    setStep("create")
  }

  const handleLockNow = () => {
    lock()
  }

  const Topbar = ({ title, onBackClick }) => (
    <div className="settings-modal-topbar">
      <button className="settings-back-btn" onClick={onBackClick}>←</button>
      <h2>{title}</h2>
      <div className="settings-modal-topbar-actions" />
    </div>
  )

  if (step === "manage") {
    return (
      <>
        <Topbar title="Local passcode" onBackClick={onBack} />
        <div className="twostep-intro">
          <div className="passcode-stars-preview">
            {[0, 1, 2, 3].map((i) => <span key={i}>✱</span>)}
          </div>
          <div className="twostep-icon">🦆🔐</div>
          <h3>Local passcode is on</h3>
          <p>
            A lock icon appears at the top of your chat list.
            Click it to lock the app.
          </p>
          <button className="twostep-primary-btn" onClick={handleLockNow}>
            Lock Now
          </button>
          <button className="twostep-primary-btn" onClick={goCreateStep}>
            Change Passcode
          </button>
          <button className="twostep-secondary-btn" onClick={handleTurnOff}>
            Turn Off
          </button>
        </div>
      </>
    )
  }

  return (
    <>
      <Topbar title="Local passcode" onBackClick={() => (hasPasscode() ? setStep("manage") : onBack())} />
      <div className="twostep-intro">
        <div className="passcode-stars-preview">
          {[0, 1, 2, 3].map((i) => <span key={i}>✱</span>)}
        </div>
        <div className="twostep-icon">🦆🔐</div>
        <h3>Create Local Passcode</h3>
        <p>
          When a local passcode is set, a lock icon appears at the top of
          your chat list. Click it to lock the app.
        </p>
        <div className="twostep-field">
          <label>Enter a passcode</label>
          <input
            type="password"
            inputMode="numeric"
            maxLength={4}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            autoFocus
          />
        </div>
        <div className="twostep-field">
          <label>Re-enter new passcode</label>
          <input
            type="password"
            inputMode="numeric"
            maxLength={4}
            value={confirmCode}
            onChange={(e) => setConfirmCode(e.target.value.replace(/\D/g, ""))}
            onKeyDown={(e) => e.key === "Enter" && handleSave()}
          />
        </div>
        <button className="twostep-primary-btn" onClick={handleSave} disabled={saving}>
          {saving ? "Saving…" : "Save Passcode"}
        </button>
      </div>
    </>
  )
}

export default LocalPasscodeView
