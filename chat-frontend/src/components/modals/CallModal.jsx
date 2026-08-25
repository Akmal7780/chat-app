import { useEffect, useRef, useState } from "react"
import toast from "react-hot-toast"
import { useCall } from "../../context/CallContext"
import { getAvatarColor } from "../../utils/avatarColor"
import "./CallModal.css"

function Avatar({ user }) {
  const name = user?.username || ""
  return (
    <div className="call-avatar">
      {user?.avatarUrl ? (
        <img src={user.avatarUrl} alt={name} />
      ) : (
        <div className="call-avatar-placeholder" style={{ background: getAvatarColor(name) }}>
          {name?.[0]?.toUpperCase()}
        </div>
      )}
    </div>
  )
}

function useCallDuration(active) {
  const [seconds, setSeconds] = useState(0)
  useEffect(() => {
    if (!active) {
      setSeconds(0)
      return
    }
    const id = setInterval(() => setSeconds((s) => s + 1), 1000)
    return () => clearInterval(id)
  }, [active])

  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, "0")}`
}

function CallModal() {
  const {
    callState,
    callType,
    remoteUser,
    isMuted,
    isVideoOn,
    localStream,
    remoteStream,
    closeCallPrompt,
    startCall,
    acceptCall,
    rejectCall,
    endCall,
    toggleMute,
    toggleVideo,
  } = useCall()

  const localVideoRef = useRef(null)
  const remoteVideoRef = useRef(null)
  const remoteAudioRef = useRef(null)
  const duration = useCallDuration(callState === "connected")

  useEffect(() => {
    if (localVideoRef.current) localVideoRef.current.srcObject = localStream || null
  }, [localStream])

  // The remote track is played through whichever element is actually
  // mounted: the visible <video> for video calls (it carries the audio
  // track too), or the hidden <audio> for audio-only calls — the video
  // element doesn't exist in the DOM at all for those, so without this
  // the remote audio track was never attached to anything and no sound
  // played.
  useEffect(() => {
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = remoteStream || null
    if (remoteAudioRef.current) remoteAudioRef.current.srcObject = remoteStream || null
  }, [remoteStream, callType])

  if (callState === "idle") return null

  if (callState === "prompt") {
    return (
      <div className="call-modal-overlay">
        <div className="call-modal call-modal-prompt">
          <button className="call-modal-close" onClick={closeCallPrompt}>×</button>
          <Avatar user={remoteUser} />
          <h2>{remoteUser?.username}</h2>
          <p className="call-hint">Click on the Camera icon if you want to start a video call.</p>

          <div className="call-modal-actions">
            <button className="call-action-btn video" onClick={() => startCall("video")} title="Start Video">
              🎥
              <span>Start Video</span>
            </button>
            <button className="call-action-btn cancel" onClick={closeCallPrompt} title="Cancel">
              ✕
              <span>Cancel</span>
            </button>
            <button className="call-action-btn accept" onClick={() => startCall("audio")} title="Start Call">
              📞
              <span>Start Call</span>
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (callState === "ringing") {
    return (
      <div className="call-modal-overlay">
        <div className="call-modal call-modal-ringing">
          <Avatar user={remoteUser} />
          <h2>{remoteUser?.username}</h2>
          <p className="call-hint">Incoming {callType === "video" ? "video" : "voice"} call…</p>

          <div className="call-modal-actions">
            <button className="call-action-btn cancel" onClick={rejectCall} title="Decline">
              ✕
              <span>Decline</span>
            </button>
            <button className="call-action-btn accept" onClick={acceptCall} title="Accept">
              📞
              <span>Accept</span>
            </button>
          </div>
        </div>
      </div>
    )
  }

  // outgoing | connected
  return (
    <div className="call-modal-overlay dark">
      <div className="call-modal call-modal-active">
        <Avatar user={remoteUser} />
        <h2>{remoteUser?.username}</h2>
        <p className="call-hint">{callState === "connected" ? duration : "waiting…"}</p>

        {callType === "video" ? (
          <div className="call-video-stage">
            <video ref={remoteVideoRef} autoPlay playsInline className="call-remote-video" />
            <video ref={localVideoRef} autoPlay playsInline muted className="call-local-video" />
          </div>
        ) : (
          <audio ref={remoteAudioRef} autoPlay />
        )}

        <div className="call-modal-controls">
          <button
            className="call-control-btn"
            onClick={() => toast("Screencast — coming soon", { icon: "🚧" })}
            title="Screencast"
          >
            🖥️
            <span>Screencast</span>
          </button>
          <button
            className={`call-control-btn ${callType === "video" && isVideoOn ? "active" : ""}`}
            onClick={toggleVideo}
            disabled={callType !== "video"}
            title={isVideoOn ? "Stop Video" : "Start Video"}
          >
            🎥
            <span>{isVideoOn ? "Stop Video" : "Start Video"}</span>
          </button>
          <button className="call-control-btn end-call" onClick={endCall} title="End Call">
            📵
            <span>End Call</span>
          </button>
          <button
            className={`call-control-btn ${isMuted ? "active" : ""}`}
            onClick={toggleMute}
            title={isMuted ? "Unmute" : "Mute"}
          >
            🎙️
            <span>{isMuted ? "Unmute" : "Mute"}</span>
          </button>
        </div>
      </div>
    </div>
  )
}

export default CallModal
