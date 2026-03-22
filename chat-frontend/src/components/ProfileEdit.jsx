import { useState, useRef, useEffect } from "react";
import api from "../api/axios";
import "../styles/profile-edit.css";

function ProfileEdit({ user, onClose, onUpdate }) {
  const [username, setUsername] = useState(user.username || "");
  const [bio, setBio] = useState(user.bio || "");
  const [avatarFile, setAvatarFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(user.avatar || "");
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});
  
  const fileInputRef = useRef(null);
  const modalRef = useRef(null);

  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose]);

useEffect(() => {
  return () => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
  };
}, [previewUrl]);

// Select image from file
const handleImageSelect = (e) => {
  const file = e.target.files[0];
  if (!file) return;

  // Validate format
  if (!file.type.startsWith("image/")) {
    setErrors(prev => ({ ...prev, avatar: "Please select an image file" }));
    return;
  }

  // File exceeds 5MB limit
  if (file.size > 5 * 1024 * 1024) {
    setErrors(prev => ({ ...prev, avatar: "Please upload an image smaller than 5MB" }));
    return;
  }

  // Preview (fast & optimized)
  const preview = URL.createObjectURL(file);

  setPreviewUrl(preview);
  setAvatarFile(file);  
  setErrors(prev => ({ ...prev, avatar: null }));
};

// Remove image
const handleRemoveImage = () => {
  setPreviewUrl("");
  setAvatarFile(null);  
  setErrors(prev => ({ ...prev, avatar: null }));

  if (fileInputRef.current) {
    fileInputRef.current.value = "";
  }
};

  // Check form
  const validateForm = () => {
    const newErrors = {};
    
    if (!username.trim()) {
      newErrors.username = 'Username is required';
    } else if (username.length < 3) {
      newErrors.username = 'Username must be at least 3 characters long';
    } else if (username.length > 30) {
      newErrors.username = 'Maximum 30 characters allowed for username';
    }
    
    if (bio && bio.length > 500) {
      newErrors.bio = 'Maximum 500 characters allowed for bio';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = async () => {
  if (!validateForm()) return;

  try {
    setLoading(true);

    const formData = new FormData();

    // 🔹 text fieldlar
    formData.append("username", username.trim());
    formData.append("bio", bio.trim());

    // 🔥 AVATAR LOGIC
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

    // 🔥 local update
    localStorage.setItem("user", JSON.stringify(updatedUser));

    onUpdate(updatedUser);
    onClose();

  } catch (err) {
    console.log("❌ Backend error:", err.response?.data);

    if (err.response?.data) {
      const errors = err.response.data;

      if (typeof errors === "object") {
        const firstError = Object.values(errors)[0];
        alert(Array.isArray(firstError) ? firstError[0] : firstError);
      } else {
        alert("An error occurred");
      }
    } else {
      alert("Failed to connect to the server");
    }

  } finally {
    setLoading(false);
  }
};
  return (
    <div className="profile-edit-overlay" onClick={onClose}>
      <div 
        className="profile-edit-modal glass-effect" 
        onClick={(e) => e.stopPropagation()}
        ref={modalRef}
      >
        
        {/* Modal Header */}
        <div className="profile-edit-header">
          <h2>
            <span className="header-icon">✎</span>
            Update profile
          </h2>
          <button 
            className="close-btn" 
            onClick={onClose}
            disabled={loading}
            title="Close (ESC)"
          >
            ×
          </button>
        </div>

        {/* Form */}
        <form onSubmit={(e) => { e.preventDefault(); handleSave(); }}>
          
          {/* Avatar Upload Section */}
          <div className="avatar-upload-section">
            <div className="avatar-preview-container">
              {previewUrl ? (
                <>
                  <img 
                    src={previewUrl} 
                    alt="Avatar preview" 
                    className="avatar-preview neon-glow"
                  />
                  <button 
                    type="button"
                    className="remove-avatar-btn"
                    onClick={handleRemoveImage}
                    disabled={loading}
                    title="Remove image"
                  >
                    ×
                  </button>
                </>
              ) : (
                <div className="avatar-placeholder neon-glow">
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
                  Select image
                </button>
                
                <button
                  type="button"
                  className="url-btn"
                  onClick={() => {
                    const url = prompt("Enter the image URL:");
                    if (url) {
                      setPreviewUrl(url);
                      setAvatarFile(null); 
                    }
                  }}
                  disabled={loading}
                  title="Upload via URL"
                >
                  <span className="url-icon">🔗</span>
                </button>
              </div>

              {errors.avatar && (
                <span className="error-text">{errors.avatar}</span>
              )}
              
              <small className="upload-hint">
                Image format: JPG, PNG, GIF (max 5MB)
              </small>
            </div>
          </div>

          {/* Username Input */}
          <div className="form-group">
            <label htmlFor="username">
              Username 
              <span className="required">*</span>
              <span className="input-hint">Username must be 3–30 characters long</span>
            </label>
            <div className="input-wrapper">
              <span className="input-icon">👤</span>
              <input
                type="text"
                id="username"
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value);
                  if (errors.username) {
                    setErrors({ ...errors, username: null });
                  }
                }}
                placeholder="Enter your username"
                className={errors.username ? 'error' : ''}
                disabled={loading}
                maxLength={30}
              />
            </div>
            {errors.username && (
              <span className="error-text">{errors.username}</span>
            )}
          </div>

          {/* Bio Textarea */}
          <div className="form-group">
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
                value={bio}
                onChange={(e) => {
                  setBio(e.target.value);
                  if (errors.bio) {
                    setErrors({ ...errors, bio: null });
                  }
                }}
                placeholder="Write a short bio about yourself..."
                className={errors.bio ? 'error' : ''}
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
          <div className="form-actions">
            <button
              type="button"
              className="cancel-btn"
              onClick={onClose}
              disabled={loading}
            >
              Cancel
            </button>
            
            <button
              type="submit"
              className="save-btn"
              disabled={loading}
            >
              {loading ? (
                <>
                  <span className="spinner-small"></span>
                  Saving changes...
                </>
              ) : (
                <>
                  <span className="save-icon">✓</span>
                  Save
                </>
              )}
            </button>
          </div>

          {/* Loading Overlay (optional) */}
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