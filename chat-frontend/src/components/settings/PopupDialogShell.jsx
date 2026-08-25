import "./PopupDialogShell.css";

// Shared centered-popup shell for the My Account sub-screens (Personal
// channel, Chat automation, Your name color, Birthday) — same interaction
// model as EditFieldDialog: pops over the still-visible Info screen instead
// of navigating away from it. stopPropagation on the backdrop click keeps a
// click-outside-to-dismiss from also bubbling up and closing the parent
// ProfileEdit modal underneath.
function PopupDialogShell({ onClose, children }) {
  return (
    <div className="popup-dialog-overlay" onClick={(e) => { e.stopPropagation(); onClose(); }}>
      <div className="popup-dialog-card" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

export default PopupDialogShell;
