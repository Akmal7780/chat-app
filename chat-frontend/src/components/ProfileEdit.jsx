import { useState, useRef, useEffect } from "react";
import api from "../api/axios";
import "../styles/profile-edit.css";

function ProfileEdit({ user, onClose, onUpdate }) {
  const [username, setUsername] = useState(user.username || "");
  const [bio, setBio] = useState(user.bio || "");
  const [avatarFile, setAvatarFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(user.avatar_url || "");
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});
  
  const fileInputRef = useRef(null);
  const modalRef = useRef(null);

  // ESC tugmasi bilan yopish
  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  // Blob URL larni tozalash (memory leak oldini olish)
  useEffect(() => {
    return () => {
      if (previewUrl && previewUrl.startsWith("blob:")) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  // Rasmni tanlash
  const handleImageSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Formatni tekshirish
    if (!file.type.startsWith("image/")) {
      setErrors(prev => ({ ...prev, avatar: "Iltimos, rasm faylini tanlang" }));
      return;
    }

    // 5MB cheklov
    if (file.size > 5 * 1024 * 1024) {
      setErrors(prev => ({ ...prev, avatar: "Rasm hajmi 5MB dan kichik bo'lishi kerak" }));
      return;
    }

    // Preview yaratish
    const preview = URL.createObjectURL(file);
    setPreviewUrl(preview);
    setAvatarFile(file);  
    setErrors(prev => ({ ...prev, avatar: null }));
  };

  // Rasmni o'chirish
  const handleRemoveImage = () => {
    if (previewUrl && previewUrl.startsWith("blob:")) {
      URL.revokeObjectURL(previewUrl);
    }
    setPreviewUrl("");
    setAvatarFile(null);  
    setErrors(prev => ({ ...prev, avatar: null }));

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  // Formani tekshirish
  const validateForm = () => {
    const newErrors = {};
    
    if (!username.trim()) {
      newErrors.username = 'Username kiritilishi shart';
    } else if (username.length < 3) {
      newErrors.username = 'Username kamida 3 ta belgidan iborat bo\'lishi kerak';
    } else if (username.length > 30) {
      newErrors.username = 'Username maksimal 30 ta belgidan iborat bo\'lishi kerak';
    }
    
    if (bio && bio.length > 500) {
      newErrors.bio = 'Bio maksimal 500 ta belgidan iborat bo\'lishi kerak';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Saqlash
  const handleSave = async () => {
    if (!validateForm()) return;

    try {
      setLoading(true);

      const formData = new FormData();
      formData.append("username", username.trim());
      formData.append("bio", bio.trim());

      // Avatar logikasi
      if (avatarFile) {
        formData.append("avatar", avatarFile);
      } else if (!previewUrl) {
        formData.append("avatar", "");   
      }

      const res = await api.patch("/users/profile/update/", formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });

      const updatedUser = res.data;
      const cleanUser = {
        ...updatedUser,
        avatar_url: updatedUser.avatar_url || null
      };

      localStorage.setItem("user", JSON.stringify(cleanUser));
      onUpdate(cleanUser);
      onClose();

    } catch (err) {
      console.log("❌ Backend error:", err.response?.data);

      if (err.response?.data) {
        const errors = err.response.data;
        if (typeof errors === "object") {
          const firstError = Object.values(errors)[0];
          alert(Array.isArray(firstError) ? firstError[0] : firstError);
        } else {
          alert("Xatolik yuz berdi");
        }
      } else {
        alert("Serverga ulanishda xatolik yuz berdi");
      }

    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="profile-edit-overlay" onClick={onClose}>
      <div 
        className="profile-edit-modal"
        onClick={(e) => e.stopPropagation()}
        ref={modalRef}
      >
        {/* Modal Header */}
        <div className="profile-edit-header">
          <h2>
            <span className="header-icon">✎</span>
            Profilni yangilash
          </h2>
          <button 
            className="close-btn" 
            onClick={onClose}
            disabled={loading}
            title="Yopish (ESC)"
          >
            ×
          </button>
        </div>

        {/* Form */}
        <form onSubmit={(e) => { e.preventDefault(); handleSave(); }}>
          
          {/* Avatar Yuklash Section */}
          <div className="avatar-upload-section">
            <div className="avatar-preview-container">
              {previewUrl ? (
                <>
                  <img 
                    src={previewUrl} 
                    alt="Avatar preview" 
                    className="avatar-preview"
                  />
                  <button 
                    type="button"
                    className="remove-avatar-btn"
                    onClick={handleRemoveImage}
                    disabled={loading}
                    title="Rasmni o'chirish"
                  >
                    ×
                  </button>
                </>
              ) : (
                <div className="avatar-placeholder">
                  {username?.[0]?.toUpperCase() || 'U'}
                </div>
              )}
            </div>

            <div className="avatar-upload-controls">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleImageSelect}
                accept="image/*"
                id="avatar-upload"
                style={{ display: 'none' }}
                disabled={loading}
              />
              
              <div className="upload-btn-group">
                <button
                  type="button"
                  className="upload-btn"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={loading}
                >
                  <span className="upload-icon">📁</span>
                  Rasm tanlash
                </button>
              </div>

              {errors.avatar && (
                <span className="error-text">{errors.avatar}</span>
              )}
              
              <small className="upload-hint">
                Rasm formati: JPG, PNG, GIF (maks. 5MB)
              </small>
            </div>
          </div>

          {/* Username Input */}
          <div className="edit-form-group">
            <label htmlFor="username">
              Username 
              <span className="required">*</span>
              <span className="input-hint">Username 3-30 ta belgidan iborat bo'lishi kerak</span>
            </label>
            <div className="input-wrapper">
              <span className="input-icon">👤</span>
              <input
                type="text"
                id="username"
                className={`profile-input ${errors.username ? 'error' : ''}`}
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value);
                  if (errors.username) {
                    setErrors({ ...errors, username: null });
                  }
                }}
                placeholder="Username kiriting"
                disabled={loading}
                maxLength={30}
              />
            </div>
            {errors.username && (
              <span className="error-text">{errors.username}</span>
            )}
          </div>

          {/* Bio Textarea */}
          <div className="edit-form-group">
            <label htmlFor="bio">
              Bio
              <span className="char-count">
                {bio.length}/500
              </span>
            </label>
            <div className="textarea-wrapper">
              <span className="textarea-icon">📝</span>
              <textarea
                id="bio"
                className={`profile-input ${errors.bio ? 'error' : ''}`}
                value={bio}
                onChange={(e) => {
                  setBio(e.target.value);
                  if (errors.bio) {
                    setErrors({ ...errors, bio: null });
                  }
                }}
                placeholder="O'zingiz haqida qisqacha ma'lumot..."
                disabled={loading}
                maxLength={500}
                rows={4}
              />
            </div>
            {errors.bio && (
              <span className="error-text">{errors.bio}</span>
            )}
          </div>

          {/* Action Buttons */}
          <div className="profile-edit-footer">
            <button
              type="button"
              className="cancel-btn"
              onClick={onClose}
              disabled={loading}
            >
              Bekor qilish
            </button>
            
            <button
              type="submit"
              className="save-btn"
              disabled={loading}
            >
              {loading ? (
                <>
                  <span className="spinner-small"></span>
                  Saqlanmoqda...
                </>
              ) : (
                <>
                  <span className="save-icon">✓</span>
                  Saqlash
                </>
              )}
            </button>
          </div>

          {/* Loading Overlay */}
          {loading && (
            <div className="modal-loading-overlay">
              <div className="spinner-pulse-small"></div>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}

export default ProfileEdit;