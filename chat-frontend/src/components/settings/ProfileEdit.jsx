import { useState, useRef, useEffect } from "react";
import toast from "react-hot-toast";
import api from "../../api/axios";
import { getAvatarColor } from "../../utils/avatarColor";
import { getAutomationSettings } from "../../utils/chatAutomation";
import EditFieldDialog from "./EditFieldDialog";
import PopupDialogShell from "./PopupDialogShell";
import PersonalChannelView from "./PersonalChannelView";
import ChatAutomationView from "./ChatAutomationView";
import NameColorView from "./NameColorView";
import BirthdayView from "./BirthdayView";
import "../../styles/profile-edit.css";

const BIO_MAX_LENGTH = 70;

function formatBirthday(iso) {
  if (!iso) return null;
  return new Date(iso + "T00:00:00").toLocaleDateString("en-US", { day: "numeric", month: "long" });
}

// Everything on this screen auto-saves the instant it changes (avatar on
// pick/remove, bio on blur, every row via its own popup) — matches
// Telegram's real Info screen, which has no separate Cancel/Save step.
function ProfileEdit({ user, onClose, onUpdate }) {
  const [bio, setBio] = useState(user.bio || "");
  const [previewUrl, setPreviewUrl] = useState(user.avatar_url || "");
  const [avatarSaving, setAvatarSaving] = useState(false);
  const [activeField, setActiveField] = useState(null);

  const fileInputRef = useRef(null);

  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === "Escape") (activeField ? setActiveField(null) : onClose());
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [onClose, activeField]);

  useEffect(() => {
    return () => {
      if (previewUrl && previewUrl.startsWith("blob:")) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  // A single generic helper reused by every sub-screen (Name/Phone/Username/
  // Personal channel/Your name color/Birthday) — each saves independently
  // and instantly, matching Telegram's real per-field edit-screen behavior.
  const patchProfile = async (fields, config) => {
    const res = await api.patch("/users/profile/update/", fields, config);
    const updatedUser = { ...res.data, avatar_url: res.data.avatar_url || null };
    localStorage.setItem("user", JSON.stringify(updatedUser));
    onUpdate(updatedUser);
    return updatedUser;
  };

  const handleImageSelect = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Iltimos, rasm faylini tanlang");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Rasm hajmi 5MB dan kichik bo'lishi kerak");
      return;
    }

    const preview = URL.createObjectURL(file);
    setPreviewUrl(preview);
    setAvatarSaving(true);
    try {
      const formData = new FormData();
      formData.append("avatar", file);
      await patchProfile(formData, { headers: { "Content-Type": "multipart/form-data" } });
    } catch {
      toast.error("Rasmni saqlashda xatolik yuz berdi");
    } finally {
      setAvatarSaving(false);
    }
  };

  const handleRemoveAvatar = async () => {
    if (previewUrl.startsWith("blob:")) URL.revokeObjectURL(previewUrl);
    setPreviewUrl("");
    if (fileInputRef.current) fileInputRef.current.value = "";
    setAvatarSaving(true);
    try {
      const formData = new FormData();
      formData.append("avatar", "");
      await patchProfile(formData, { headers: { "Content-Type": "multipart/form-data" } });
    } catch {
      toast.error("Rasmni o'chirishda xatolik yuz berdi");
    } finally {
      setAvatarSaving(false);
    }
  };

  const handleBioBlur = async () => {
    const trimmed = bio.trim();
    if (trimmed === (user.bio || "")) return;
    try {
      await patchProfile({ bio: trimmed });
    } catch {
      toast.error("Bio saqlashda xatolik yuz berdi");
    }
  };

  const automation = getAutomationSettings();

  return (
    <div className="profile-edit-overlay" onClick={onClose}>
      <div
        className="profile-edit-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="profile-edit-header">
          <button className="settings-back-btn" onClick={onClose} title="Orqaga">←</button>
          <h2>Info</h2>
          <button
            className="close-btn"
            onClick={onClose}
            title="Yopish (ESC)"
          >
            ×
          </button>
        </div>

        <div className="avatar-upload-section">
          <div className="avatar-preview-wrapper">
            <div className="avatar-preview-container">
              {previewUrl ? (
                <img
                  src={previewUrl}
                  alt="Avatar preview"
                  className="avatar-preview"
                />
              ) : (
                <div className="avatar-placeholder" style={{ background: getAvatarColor(user.username) }}>
                  {(user.full_name || "Unknown")[0].toUpperCase()}
                </div>
              )}
            </div>
            {previewUrl && (
              <button
                type="button"
                className="remove-avatar-btn"
                onClick={handleRemoveAvatar}
                disabled={avatarSaving}
                title="Rasmni o'chirish"
              >
                ×
              </button>
            )}
            <button
              type="button"
              className="avatar-camera-btn"
              onClick={() => fileInputRef.current?.click()}
              disabled={avatarSaving}
              title="Rasm o'zgartirish"
            >
              📷
            </button>
          </div>

          <input
            type="file"
            ref={fileInputRef}
            onChange={handleImageSelect}
            accept="image/*"
            id="avatar-upload"
            style={{ display: "none" }}
            disabled={avatarSaving}
          />

          <span className="profile-own-name">{user.full_name || "Unknown"}</span>
          <span className="profile-status-line">online</span>
        </div>

        <div className="edit-form-group">
          <label htmlFor="bio">
            Bio
            <span className="char-count">{BIO_MAX_LENGTH - bio.length}</span>
          </label>
          <div className="textarea-wrapper">
            <span className="textarea-icon">📝</span>
            <textarea
              id="bio"
              className="profile-input"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              onBlur={handleBioBlur}
              placeholder="O'zingiz haqida qisqacha ma'lumot..."
              maxLength={BIO_MAX_LENGTH}
              rows={3}
            />
          </div>
          <span className="profile-hint-text" style={{ padding: "2px 0 0" }}>
            Yoshi, kasbi yoki shahri kabi tafsilotlar. Masalan: 23 yosh, dizayner, Toshkentdan
          </span>
        </div>

        <div className="settings-list">
          <button type="button" className="settings-list-item" onClick={() => setActiveField("name")}>
            <span className="settings-list-icon">👤</span>
            <span>Full Name</span>
            <span className="settings-list-value">{user.full_name || "Add"}</span>
          </button>
          <button type="button" className="settings-list-item" onClick={() => setActiveField("phone")}>
            <span className="settings-list-icon">📞</span>
            <span>Phone number</span>
            <span className="settings-list-value">{user.phone_number || "Add"}</span>
          </button>
          <button type="button" className="settings-list-item" onClick={() => setActiveField("username")}>
            <span className="settings-list-icon">@</span>
            <span>Username</span>
            <span className="settings-list-value">@{user.username}</span>
          </button>
        </div>
        <div className="profile-hint-text">
          Username lets people contact you without needing your phone number.
        </div>

        <div className="settings-list">
          <button type="button" className="settings-list-item" onClick={() => setActiveField("personalChannel")}>
            <span className="settings-list-icon">📢</span>
            <span>Personal channel</span>
            <span className="settings-list-value">{user.personal_channel_info?.name || "Add"}</span>
          </button>
          <button type="button" className="settings-list-item" onClick={() => setActiveField("chatAutomation")}>
            <span className="settings-list-icon">🤖</span>
            <span>Chat automation</span>
            <span className="profile-badge-new">NEW</span>
            <span className="settings-list-value">{automation.botHandle ? "On" : "Off"}</span>
          </button>
          <button type="button" className="settings-list-item" onClick={() => setActiveField("nameColor")}>
            <span className="settings-list-icon">🎨</span>
            <span>Your name color</span>
            <span
              className="settings-list-value settings-name-pill"
              style={{ background: user.name_color || getAvatarColor(user.username), color: "#fff" }}
            >
              {user.full_name || "Unknown"}
            </span>
          </button>
          <button type="button" className="settings-list-item" onClick={() => setActiveField("birthday")}>
            <span className="settings-list-icon">🎂</span>
            <span>Birthday</span>
            <span className="settings-list-value">{formatBirthday(user.birthday) || "Add"}</span>
          </button>
        </div>
      </div>

      {activeField === "name" && (
        <EditFieldDialog
          title="Edit your name"
          label="Full Name"
          value={user.full_name}
          placeholder="Ismingiz"
          maxLength={150}
          requiredMessage="Name is required"
          onClose={() => setActiveField(null)}
          onSave={(v) => patchProfile({ full_name: v })}
        />
      )}

      {activeField === "phone" && (
        <EditFieldDialog
          title="Phone number"
          label="Phone number"
          value={user.phone_number}
          placeholder="+998 90 123 45 67"
          maxLength={32}
          type="tel"
          allowEmpty
          onClose={() => setActiveField(null)}
          onSave={(v) => patchProfile({ phone_number: v })}
        />
      )}

      {activeField === "username" && (
        <EditFieldDialog
          title="Username"
          label="@username"
          value={user.username}
          placeholder="Username kiriting"
          maxLength={30}
          hint={"You can choose a username on Telegram. If you do, other people will be able to find you by this username and contact you without knowing your phone number.\n\nYou can use a-z, 0-9 and underscores. Minimum length is 5 characters."}
          requiredMessage="Username is required"
          onClose={() => setActiveField(null)}
          onSave={(v) => patchProfile({ username: v })}
        />
      )}

      {activeField === "personalChannel" && (
        <PopupDialogShell onClose={() => setActiveField(null)}>
          <PersonalChannelView
            currentUser={user}
            currentChannelId={user.personal_channel_info?.id || null}
            onBack={() => setActiveField(null)}
            onSaved={(channelId) => patchProfile({ personal_channel: channelId })}
          />
        </PopupDialogShell>
      )}

      {activeField === "chatAutomation" && (
        <PopupDialogShell onClose={() => setActiveField(null)}>
          <ChatAutomationView onBack={() => setActiveField(null)} />
        </PopupDialogShell>
      )}

      {activeField === "nameColor" && (
        <PopupDialogShell onClose={() => setActiveField(null)}>
          <NameColorView
            user={user}
            onBack={() => setActiveField(null)}
            onSaved={(color) => patchProfile({ name_color: color })}
          />
        </PopupDialogShell>
      )}

      {activeField === "birthday" && (
        <PopupDialogShell onClose={() => setActiveField(null)}>
          <BirthdayView
            value={user.birthday}
            onBack={() => setActiveField(null)}
            onSaved={(iso) => patchProfile({ birthday: iso })}
          />
        </PopupDialogShell>
      )}
    </div>
  );
}

export default ProfileEdit;
