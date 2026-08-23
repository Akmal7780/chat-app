import toast from "react-hot-toast"

function AdvancedView({ onBack }) {
  const handleComingSoon = (label) => {
    toast(`${label} — coming soon`, { icon: "🚧" })
  }

  return (
    <>
      <div className="settings-modal-topbar">
        <button className="settings-back-btn" onClick={onBack}>←</button>
        <h2>Advanced</h2>
        <div className="settings-modal-topbar-actions" />
      </div>

      <div className="settings-list">
        <div className="settings-list-section-label">Data and storage</div>

        <button className="settings-list-item" onClick={() => handleComingSoon("Connection type")}>
          <span className="settings-list-icon">⇅</span>
          <span>Connection type</span>
          <span className="settings-list-value">Default (TCP used)</span>
        </button>

        <button className="settings-list-item" onClick={() => handleComingSoon("Download path")}>
          <span className="settings-list-icon">📁</span>
          <span>Download path</span>
          <span className="settings-list-value">Default folder</span>
        </button>

        <button className="settings-list-item" onClick={() => handleComingSoon("Manage local storage")}>
          <span className="settings-list-icon">💾</span>
          <span>Manage local storage</span>
        </button>

        <button className="settings-list-item" onClick={() => handleComingSoon("Downloads")}>
          <span className="settings-list-icon">⬇️</span>
          <span>Downloads</span>
        </button>

        <button
          className="settings-list-item settings-list-toggle"
          onClick={() => handleComingSoon("Ask download path for each file")}
        >
          <span>Ask download path for each file</span>
          <label className="settings-switch">
            <input type="checkbox" checked={false} readOnly />
            <span className="settings-switch-slider" />
          </label>
        </button>
      </div>

      <div className="settings-list">
        <div className="settings-list-section-label">Automatic media download</div>

        <button
          className="settings-list-item settings-list-toggle"
          onClick={() => handleComingSoon("Automatic media download in private chats")}
        >
          <span className="settings-list-icon">👤</span>
          <span>In private chats</span>
          <label className="settings-switch">
            <input type="checkbox" checked readOnly />
            <span className="settings-switch-slider" />
          </label>
        </button>

        <button
          className="settings-list-item settings-list-toggle"
          onClick={() => handleComingSoon("Automatic media download in groups")}
        >
          <span className="settings-list-icon">👥</span>
          <span>In groups</span>
          <label className="settings-switch">
            <input type="checkbox" checked readOnly />
            <span className="settings-switch-slider" />
          </label>
        </button>
      </div>
    </>
  )
}

export default AdvancedView
