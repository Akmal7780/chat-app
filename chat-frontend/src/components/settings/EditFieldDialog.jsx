import { useState } from "react";
import toast from "react-hot-toast";
import "./EditFieldDialog.css";

// Small popup dialog (not a full-screen navigation) — matches Telegram's
// real "Edit your name"/"Edit username" behavior, which pops a centered
// card over the still-visible Info screen rather than replacing it.
function EditFieldDialog({
  title,
  label,
  value,
  placeholder,
  hint,
  maxLength,
  type = "text",
  allowEmpty = false,
  requiredMessage,
  onClose,
  onSave,
}) {
  const [text, setText] = useState(value || "");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!allowEmpty && !text.trim()) {
      toast.error(requiredMessage || `${label} is required`);
      return;
    }
    setSaving(true);
    try {
      await onSave(text.trim());
      onClose();
    } catch (err) {
      const data = err.response?.data;
      const firstError = data && typeof data === "object" ? Object.values(data)[0] : null;
      toast.error((Array.isArray(firstError) ? firstError[0] : firstError) || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="edit-field-dialog-overlay" onClick={(e) => { e.stopPropagation(); onClose(); }}>
      <div className="edit-field-dialog" onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>
        <div className="edit-field-dialog-field">
          <label>{label}</label>
          <input
            type={type}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={placeholder}
            maxLength={maxLength}
            autoFocus
            disabled={saving}
            onKeyDown={(e) => e.key === "Enter" && handleSave()}
          />
        </div>
        {hint && <p className="edit-field-dialog-hint">{hint}</p>}
        <div className="edit-field-dialog-actions">
          <button onClick={onClose} disabled={saving}>Cancel</button>
          <button onClick={handleSave} disabled={saving}>{saving ? "…" : "Save"}</button>
        </div>
      </div>
    </div>
  );
}

export default EditFieldDialog;
