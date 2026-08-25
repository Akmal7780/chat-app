import { useState } from "react"
import toast from "react-hot-toast"
import "./BirthdayView.css"

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
]

function daysInMonth(month, year) {
  return new Date(year, month + 1, 0).getDate()
}

// Three plain <select> wheels rather than a custom scroll-snap widget —
// functionally equivalent for picking a date without building a bespoke
// scroll-wheel component from scratch.
function BirthdayView({ value, onBack, onSaved }) {
  const parsed = value ? new Date(value + "T00:00:00") : null
  const currentYear = new Date().getFullYear()

  const [day, setDay] = useState(parsed ? parsed.getDate() : "")
  const [month, setMonth] = useState(parsed ? parsed.getMonth() : "")
  const [year, setYear] = useState(parsed ? parsed.getFullYear() : "")
  const [saving, setSaving] = useState(false)

  const maxDay = month !== "" && year !== "" ? daysInMonth(Number(month), Number(year)) : 31

  const handleSave = async () => {
    if (day === "" || month === "" || year === "") {
      toast.error("Please pick a full date")
      return
    }
    const iso = `${year}-${String(Number(month) + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`
    setSaving(true)
    try {
      await onSaved(iso)
      onBack()
    } catch (err) {
      toast.error("Failed to save birthday")
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div className="settings-modal-topbar">
        <button className="settings-back-btn" onClick={onBack}>←</button>
        <h2>Set your Birthday</h2>
        <div className="settings-modal-topbar-actions" />
      </div>

      <div className="birthday-wheels">
        <select value={day} onChange={(e) => setDay(Number(e.target.value))}>
          <option value="" disabled>Day</option>
          {Array.from({ length: maxDay }, (_, i) => i + 1).map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
        <select value={month} onChange={(e) => setMonth(Number(e.target.value))}>
          <option value="" disabled>Month</option>
          {MONTHS.map((m, i) => (
            <option key={m} value={i}>{m}</option>
          ))}
        </select>
        <select value={year} onChange={(e) => setYear(Number(e.target.value))}>
          <option value="" disabled>Year</option>
          {Array.from({ length: currentYear - 1930 + 1 }, (_, i) => currentYear - i).map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      </div>

      <div className="birthday-actions">
        <button className="settings-topbar-link" onClick={onBack} disabled={saving}>Cancel</button>
        <button className="settings-topbar-link" onClick={handleSave} disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </>
  )
}

export default BirthdayView
