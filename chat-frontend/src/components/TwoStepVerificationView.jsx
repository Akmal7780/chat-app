import { useEffect, useState } from "react"
import toast from "react-hot-toast"
import api from "../api/axios"
import "./TwoStepVerificationView.css"

function TwoStepVerificationView({ onBack }) {
  const [status, setStatus] = useState(null)
  const [step, setStep] = useState("loading")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [hint, setHint] = useState("")
  const [recoveryEmail, setRecoveryEmail] = useState("")
  const [disablePassword, setDisablePassword] = useState("")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api.get("/users/2fa/status/")
      .then((res) => {
        setStatus(res.data)
        setStep(res.data.enabled ? "manage" : "intro")
      })
      .catch((err) => {
        console.error("2FA status error:", err)
        setStep("intro")
      })
  }, [])

  const goPasswordStep = () => {
    setPassword("")
    setConfirmPassword("")
    setStep("password")
  }

  const handlePasswordContinue = () => {
    if (password.length < 4) {
      toast.error("Password must be at least 4 characters")
      return
    }
    if (password !== confirmPassword) {
      toast.error("Passwords do not match")
      return
    }
    setStep("hint")
  }

  const handleFinish = async () => {
    setSaving(true)
    try {
      await api.post("/users/2fa/enable/", {
        password,
        hint,
        recovery_email: recoveryEmail || null,
      })
      toast.success("Two-Step Verification enabled")
      const res = await api.get("/users/2fa/status/")
      setStatus(res.data)
      setStep("manage")
    } catch (err) {
      console.error("2FA enable error:", err)
      toast.error(err.response?.data?.error || "Failed to enable Two-Step Verification")
    } finally {
      setSaving(false)
    }
  }

  const handleDisable = async () => {
    setSaving(true)
    try {
      await api.post("/users/2fa/disable/", { password: disablePassword })
      toast.success("Two-Step Verification disabled")
      setDisablePassword("")
      setStatus({ enabled: false, hint: "", recovery_email: null })
      setStep("intro")
    } catch (err) {
      console.error("2FA disable error:", err)
      toast.error(err.response?.data?.error || "Incorrect password")
    } finally {
      setSaving(false)
    }
  }

  const Topbar = ({ title, onBackClick }) => (
    <div className="settings-modal-topbar">
      <button className="settings-back-btn" onClick={onBackClick}>←</button>
      <h2>{title}</h2>
      <div className="settings-modal-topbar-actions" />
    </div>
  )

  if (step === "loading") {
    return (
      <>
        <Topbar title="Two-Step Verification" onBackClick={onBack} />
        <div className="twostep-loading">Loading…</div>
      </>
    )
  }

  if (step === "intro") {
    return (
      <>
        <Topbar title="Two-Step Verification" onBackClick={onBack} />
        <div className="twostep-intro">
          <div className="twostep-icon">🔐</div>
          <h3>Two-Step Verification</h3>
          <p>Protect your account with an additional password.</p>
          <button className="twostep-primary-btn" onClick={goPasswordStep}>
            Create Password
          </button>
        </div>
      </>
    )
  }

  if (step === "manage") {
    return (
      <>
        <Topbar title="Two-Step Verification" onBackClick={onBack} />
        <div className="twostep-intro">
          <div className="twostep-icon">🔐</div>
          <h3>Two-Step Verification is on</h3>
          <p>
            You'll need this password when you log in on a new device
            {status?.recovery_email ? `. Recovery email: ${status.recovery_email}` : "."}
          </p>
          <button className="twostep-primary-btn" onClick={goPasswordStep}>
            Change Password
          </button>
          <button className="twostep-secondary-btn" onClick={() => { setDisablePassword(""); setStep("disable") }}>
            Turn Off
          </button>
        </div>
      </>
    )
  }

  if (step === "disable") {
    return (
      <>
        <Topbar title="Turn Off" onBackClick={() => setStep("manage")} />
        <div className="twostep-intro">
          <div className="twostep-icon">🔓</div>
          <h3>Turn Off Two-Step Verification</h3>
          <p>Enter your password to confirm.</p>
          <div className="twostep-field">
            <input
              type="password"
              placeholder="Enter password"
              value={disablePassword}
              onChange={(e) => setDisablePassword(e.target.value)}
              autoFocus
            />
          </div>
          <button className="twostep-primary-btn twostep-danger-btn" onClick={handleDisable} disabled={saving}>
            {saving ? "Please wait…" : "Turn Off"}
          </button>
        </div>
      </>
    )
  }

  if (step === "password") {
    return (
      <>
        <Topbar title="Password" onBackClick={() => setStep(status?.enabled ? "manage" : "intro")} />
        <div className="twostep-intro">
          <div className="twostep-icon">🙈</div>
          <h3>Create Password</h3>
          <p>This password will be asked when you log in on a new device in addition to your usual password.</p>
          <div className="twostep-field">
            <label>Enter new password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
            />
          </div>
          <div className="twostep-field">
            <label>Re-enter new password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handlePasswordContinue()}
            />
          </div>
          <button className="twostep-primary-btn" onClick={handlePasswordContinue}>
            Continue
          </button>
        </div>
      </>
    )
  }

  if (step === "hint") {
    return (
      <>
        <Topbar title="Password Hint" onBackClick={() => setStep("password")} />
        <div className="twostep-intro">
          <div className="twostep-icon">💡</div>
          <h3>Add Password Hint</h3>
          <p>You can create a hint for your password.</p>
          <div className="twostep-field">
            <label>Add a password hint</label>
            <input
              type="text"
              value={hint}
              onChange={(e) => setHint(e.target.value)}
              autoFocus
            />
          </div>
          <a className="twostep-skip-link" onClick={() => setStep("email")}>Skip setting hint</a>
          <button className="twostep-primary-btn" onClick={() => setStep("email")}>
            Continue
          </button>
        </div>
      </>
    )
  }

  if (step === "email") {
    return (
      <>
        <Topbar title="Recovery Email" onBackClick={() => setStep("hint")} />
        <div className="twostep-intro">
          <div className="twostep-icon">📬</div>
          <h3>Add Recovery Email</h3>
          <p>Please enter your recovery email. It is the only way to recover a forgotten password.</p>
          <div className="twostep-field">
            <label>Enter recovery email</label>
            <input
              type="email"
              value={recoveryEmail}
              onChange={(e) => setRecoveryEmail(e.target.value)}
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && handleFinish()}
            />
          </div>
          <a className="twostep-skip-link" onClick={handleFinish}>Skip email</a>
          <button className="twostep-primary-btn" onClick={handleFinish} disabled={saving}>
            {saving ? "Saving…" : "Save and Finish"}
          </button>
        </div>
      </>
    )
  }

  return null
}

export default TwoStepVerificationView
