import { useState, useRef, useEffect } from "react"
import api from "../api/axios"
import "./MessageInput.css"
import { lazy, Suspense } from "react"

const EmojiPicker = lazy(() => import("emoji-picker-react"))
function MessageInput({
  onSendMessage,
  isConnected,
  onTyping,
  conversation,
  messages,
  onFileUploaded,
  currentUser,
  replyMessage,
  onCancelReply
}) {
  const [message, setMessage] = useState("")
  const [isRecording, setIsRecording] = useState(false)
  const [recordingSeconds, setRecordingSeconds] = useState(0)
  const [selectedFile, setSelectedFile] = useState(null)
  const mediaRecorderRef = useRef(null)
  const recordedChunksRef = useRef([])
  const recordingTimerRef = useRef(null)
  const recordingStreamRef = useRef(null)
  const discardRecordingRef = useRef(false)

  const [filePreview, setFilePreview] = useState(null)
  const [isDragging, setIsDragging] = useState(false)
  const emojiPickerRef = useRef(null)
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const aiMenuRef = useRef(null)
  const aiButtonRef = useRef(null)

  const fileInputRef = useRef(null)
  const textareaRef = useRef(null)
  const dropZoneRef = useRef(null)

  const [suggestions, setSuggestions] = useState([])
  const [loadingSuggestions, setLoadingSuggestions] = useState(false)
  const [showAiMenu, setShowAiMenu] = useState(false)
  const [loadingAi, setLoadingAi] = useState(false)
  const suggestionsRequestRef = useRef(0)

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto"
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`
    }
  }, [message])

  useEffect(() => {
  const timer = setTimeout(() => {
    if (message.trim().length > 5) {
      getSuggestions()
    } else {
      setSuggestions([])
    }
  }, 1000)

  return () => clearTimeout(timer)
}, [message])

  useEffect(() => {
  const handleClickOutside = (event) => {
    if (
      emojiPickerRef.current &&
      !emojiPickerRef.current.contains(event.target)
    ) {
      setShowEmojiPicker(false)
    }

    if (
      aiMenuRef.current &&
      !aiMenuRef.current.contains(event.target) &&
      aiButtonRef.current &&
      !aiButtonRef.current.contains(event.target)
    ) {
      setShowAiMenu(false)
    }
  }

  document.addEventListener("mousedown", handleClickOutside)

  return () => {
    document.removeEventListener("mousedown", handleClickOutside)
  }
}, [])

useEffect(() => {
  return () => {
    if (filePreview && filePreview.startsWith("blob:")) {
  URL.revokeObjectURL(filePreview)
}
  }
}, [filePreview])

const getSuggestions = async () => {
  const history = (messages || [])
    .filter(m => !m.is_deleted && m.content?.trim())
    .slice(-10)
    .map(m =>
      `${m.sender_id === currentUser?.id ? "Me" : (m.sender_username || m.sender || "Them")}: ${m.content}`
    )

  if (history.length === 0) {
    setSuggestions([])
    return
  }

  const requestId = ++suggestionsRequestRef.current

  try {
    setLoadingSuggestions(true)

    const res = await api.post("/ai/suggest-reply/", {
      messages: history
    })

    if (requestId !== suggestionsRequestRef.current) return

    setSuggestions([res.data.suggestion])

  } catch (error) {
    if (requestId !== suggestionsRequestRef.current) return
    console.error("AI suggestion error:", error)
  } finally {
    if (requestId === suggestionsRequestRef.current) {
      setLoadingSuggestions(false)
    }
  }
}

  const handleChange = (e) => {
    const value = e.target.value
    setMessage(value)

    if (onTyping && value.trim()) {
      onTyping()
    }
  }

  const handleSend = () => {
    if ((!message.trim() && !selectedFile) || !isConnected) return

    if (selectedFile) {
      // If a file is selected, first send the file
      handleFileUpload(selectedFile)
    } else {
      onSendMessage(message,[], replyMessage)
      setMessage("")
      setShowEmojiPicker(false)
      onCancelReply?.() // Clear reply
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSend()
      setShowEmojiPicker(false)
    }
    if (e.key === "Escape") {
  setShowEmojiPicker(false)
}
  }

  // File selection
  const handleFileSelect = (e) => {
    const file = e.target.files[0]
    if (!file || !conversation) return
    
    setSelectedFile(file)
    if (filePreview && filePreview.startsWith("blob:")) {
  URL.revokeObjectURL(filePreview)
}

setFilePreview(URL.createObjectURL(file))
  }

  const CHUNK_SIZE = 5 * 1024 * 1024 // 5MB

const handleFileUpload = async (file, { messageType } = {}) => {
  const preview = URL.createObjectURL(file)
  const tempId = "temp_" + Date.now() + "_" + Math.random()
  const isImage = file.type.startsWith("image")
  const attachmentType = messageType || (isImage ? "image" : "file")

  const uploadedMap = {} // 🔥 safe progress

  const tempMessage = {
    id: tempId,
    sender_id: currentUser?.id,
    sender_username: currentUser?.username,
    content: "",
    attachments: [
      {
        file_url: preview,
        file_type: attachmentType,
        original_name: file.name,
        file_size: file.size
      }
    ],
    created_at: new Date().toISOString(),
    status: "sending",
    progress: 0
  }

  onFileUploaded?.(tempMessage)

  try {
    // =========================
    // 1. INIT
    // =========================
    const initRes = await api.post("/upload/init/", {
      file_name: file.name,
      file_size: file.size,
      conversation_id: conversation.id
    })

    const { upload_id, key } = initRes.data

    // =========================
    // 2. CHUNKS PREPARE
    // =========================
    const chunks = []
    let partNumber = 1

    for (let start = 0; start < file.size; start += CHUNK_SIZE) {
      chunks.push({
        chunk: file.slice(start, start + CHUNK_SIZE),
        partNumber: partNumber++
      })
    }

    // =========================
    // 3. LIMIT PARALLEL 
    // =========================
    const CONCURRENCY = 3
    const parts = []

    const uploadChunk = async ({ chunk, partNumber }) => {
      const formData = new FormData()
      formData.append("file", new Blob([chunk], { type: file.type }), file.name)
      formData.append("key", key)
      formData.append("upload_id", upload_id)
      formData.append("part_number", partNumber)

      const res = await api.post("/upload/part-direct/", formData)

      // 🔥 SAFE PROGRESS
      uploadedMap[partNumber] = chunk.size

      const totalUploaded = Object.values(uploadedMap)
        .reduce((a, b) => a + b, 0)

      const percent = Math.round((totalUploaded / file.size) * 100)

      onFileUploaded?.({
        ...tempMessage,
        progress: percent
      })

      return {
        ETag: res.data.ETag,
        PartNumber: partNumber
      }
    }

    // 🔥 batch processing (with limit)
    for (let i = 0; i < chunks.length; i += CONCURRENCY) {
      const batch = chunks.slice(i, i + CONCURRENCY)

      const results = await Promise.all(
        batch.map(uploadChunk)
      )

      parts.push(...results)
    }

    parts.sort((a, b) => a.PartNumber - b.PartNumber)

    // =========================
    // 4. COMPLETE
    // =========================
    await api.post("/upload/complete/", {
      key,
      upload_id,
      parts,
      conversation_id: conversation.id,
      file_name: file.name,
      size: file.size,
      ...(messageType ? { message_type: messageType } : {})
    })

    // 🔥 TEMP REMOVE
    onFileUploaded?.({
      id: tempId,
      remove: true
    })

    // =========================
    // CLEANUP
    // =========================
    if (preview.startsWith("blob:")) {
      URL.revokeObjectURL(preview)
    }

    setSelectedFile(null)
    setFilePreview(null)

    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }

  } catch (error) {
    console.error("❌ Upload error:", error)

    onFileUploaded?.({
      ...tempMessage,
      status: "error"
    })
  }
}
  // Cancel file
  const cancelFile = () => {
  if (filePreview && filePreview.startsWith("blob:")) {
    URL.revokeObjectURL(filePreview)
  }

  setSelectedFile(null)
  setFilePreview(null)

  if (fileInputRef.current) fileInputRef.current.value = ""
}

  // Drag & Drop handlers
  const handleDragEnter = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }

  const handleDragLeave = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }

  const handleDragOver = (e) => {
    e.preventDefault()
    e.stopPropagation()
  }

  const handleDrop = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)

    const file = e.dataTransfer.files[0]
    if (file && conversation) {
      setSelectedFile(file)
      setFilePreview(URL.createObjectURL(file))
    }
  }

  // Voice message recording
  const startRecording = async () => {
    if (!conversation || isRecording) return

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      recordingStreamRef.current = stream

      const mimeType = MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : ""
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      mediaRecorderRef.current = recorder
      recordedChunksRef.current = []
      discardRecordingRef.current = false

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) recordedChunksRef.current.push(e.data)
      }

      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop())
        recordingStreamRef.current = null

        const wasDiscarded = discardRecordingRef.current
        const chunks = recordedChunksRef.current
        recordedChunksRef.current = []

        if (!wasDiscarded && chunks.length > 0) {
          const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" })
          const ext = (recorder.mimeType || "audio/webm").includes("ogg") ? "ogg" : "webm"
          const file = new File([blob], `voice_${Date.now()}.${ext}`, { type: blob.type })
          handleFileUpload(file, { messageType: "voice" })
        }
      }

      recorder.start()
      setIsRecording(true)
      setRecordingSeconds(0)
      recordingTimerRef.current = setInterval(() => {
        setRecordingSeconds((s) => s + 1)
      }, 1000)
    } catch (err) {
      console.error("Microphone permission error:", err)
    }
  }

  const stopRecording = (discard = false) => {
    if (!mediaRecorderRef.current || !isRecording) return

    discardRecordingRef.current = discard
    mediaRecorderRef.current.stop()
    setIsRecording(false)
    clearInterval(recordingTimerRef.current)
    recordingTimerRef.current = null
  }

  useEffect(() => {
    return () => {
      clearInterval(recordingTimerRef.current)
      recordingStreamRef.current?.getTracks().forEach((track) => track.stop())
    }
  }, [])

  const formatRecordingTime = (totalSeconds) => {
    const m = Math.floor(totalSeconds / 60)
    const s = totalSeconds % 60
    return `${m}:${s.toString().padStart(2, "0")}`
  }

  // Emoji picker 
  const handleEmojiClick = (emojiData) => {
  setMessage(prev => prev + emojiData.emoji)
  textareaRef.current?.focus()
  setShowEmojiPicker(false)
}

const runAiAction = async (endpoint, payload, resultField, label) => {
  if (!message.trim()) return

  try {
    setLoadingAi(true)

    const res = await api.post(endpoint, payload)

    setMessage(res.data[resultField])
    setShowAiMenu(false)

  } catch (err) {
    console.error(`${label} error:`, err)
  } finally {
    setLoadingAi(false)
  }
}

const handleTranslate = () =>
  runAiAction(
    "/ai/translate/",
    { message, target_language: "uzbek" },
    "translated_text",
    "Translate"
  )

const handleGrammarFix = () =>
  runAiAction(
    "/ai/grammar-fix/",
    { message },
    "corrected_text",
    "Grammar Fix"
  )

const handleRewrite = (tone) =>
  runAiAction(
    "/ai/rewrite/",
    { message, tone },
    "rewritten_text",
    "Rewrite"
  )


  return (
    <div 
      className={`message-input-container ${isDragging ? 'dragging' : ''}`}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      ref={dropZoneRef}
    >

 {/* 🔥 REPLY PREVIEW */}
    {replyMessage && (
      <div className="reply-preview">
        <div className="reply-content">
          <strong>
        {replyMessage.sender_username || replyMessage.sender}
      </strong>
          <span>{replyMessage.content}</span>
        </div>

        <button
          className="reply-cancel"
          onClick={onCancelReply}
        >
          ✕
        </button>
      </div>
    )}

      {/* Drag & Drop overlay */}
      {isDragging && (
        <div className="drag-overlay">
          <div className="drag-content">
            <span className="drag-icon">📁</span>
            <span>Drop file here to upload</span>
          </div>
        </div>
      )}

      {/* File preview */}
      {selectedFile && (
        <div className="file-preview">
          {selectedFile.type.startsWith("image") ? (
            <div className="image-preview">
              <img src={filePreview} alt="Preview" />
            </div>
          ) : (
            <div className="file-preview-icon">
              <span className="file-emoji">📄</span>
            </div>
          )}
          <div className="file-preview-info">
            <span className="file-preview-name">{selectedFile.name}</span>
            <span className="file-preview-size">
              {(selectedFile.size / 1024).toFixed(1)} KB
            </span>
          </div>
          <button className="file-preview-cancel" onClick={cancelFile}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </button>
        </div>
      )}

      {(loadingSuggestions || suggestions.length > 0) && (
  <div className="ai-suggestions">

    {loadingSuggestions && (
      <div className="ai-loading">
        AI is thinking...
      </div>
    )}

    {suggestions.map((suggestion, index) => (
      <button
        key={index}
        className="suggestion-chip"
        onClick={() => {
          setMessage(suggestion)
          setSuggestions([])
        }}
      >
        ✨ {suggestion}
      </button>
    ))}

  </div>
)}

      {/* Input area */}
      <div className="input-area">
        {/* Attachment button */}
        <button
          className="action-button attach-button"
          onClick={() => fileInputRef.current?.click()}
          disabled={!isConnected}
          title="Attach file"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <path d="M21.44 11.05L12.25 20.24C11.1242 21.3658 9.59723 22 8.00502 22C6.41281 22 4.88584 21.3658 3.76002 20.24C2.6342 19.1142 2 17.5872 2 15.995C2 14.4028 2.6342 12.8758 3.76002 11.75L12.33 3.18C13.1147 2.39532 14.172 1.95157 15.28 1.95157C16.388 1.95157 17.4453 2.39532 18.23 3.18C19.0147 3.96468 19.4584 5.022 19.4584 6.13C19.4584 7.238 19.0147 8.29532 18.23 9.08L9.64002 17.65C9.1968 18.0932 8.59446 18.3414 7.96502 18.3414C7.33558 18.3414 6.73324 18.0932 6.29002 17.65C5.8468 17.2068 5.59861 16.6045 5.59861 15.975C5.59861 15.3456 5.8468 14.7432 6.29002 14.3L14.44 6.16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
          </svg>
        </button>

        {/* Emoji button */}
        <button
          className="action-button emoji-button"
          onClick={() => setShowEmojiPicker(!showEmojiPicker)}
          disabled={!isConnected}
          title="Add emoji"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z" stroke="currentColor" strokeWidth="1.8"/>
            <path d="M8 14C8 14 9.5 16 12 16C14.5 16 16 14 16 14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
            <circle cx="8.5" cy="9.5" r="1.5" fill="currentColor"/>
            <circle cx="15.5" cy="9.5" r="1.5" fill="currentColor"/>
          </svg>
        </button>

        {/* AI tools */}
        <button
          ref={aiButtonRef}
          className="action-button ai-button"
          onClick={() => setShowAiMenu(prev => !prev)}
          disabled={!isConnected}
          title="AI Tools"
        >
          ✨
        </button>

        {/* Hidden file input */}
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileSelect}
          style={{ display: "none" }}
        />

        {/* Text input area */}
        <div className="text-input-wrapper">
          <textarea
            ref={textareaRef}
            value={message}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder={
              !isConnected
                ? "Connecting..."
                : conversation?.type === "channel"
                ? "Broadcast a message..."
                : "Type a message..."
            }
            disabled={!isConnected}
            className="message-textarea"
            rows="1"
          />
          
          {/* Voice button (appears when input is empty) */}
          {!message.trim() && !selectedFile && !isRecording && (
            <button
              className="voice-button"
              onClick={startRecording}
              disabled={!isConnected}
              title="Voice message"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                <path d="M12 2C10.9 2 10 2.9 10 4V12C10 13.1 10.9 14 12 14C13.1 14 14 13.1 14 12V4C14 2.9 13.1 2 12 2Z" stroke="currentColor" strokeWidth="1.8"/>
                <path d="M19 10V12C19 15.87 15.87 19 12 19C8.13 19 5 15.87 5 12V10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                <path d="M12 19V22" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                <path d="M8 22H16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
              </svg>
            </button>
          )}

          {isRecording && (
            <div className="recording-indicator">
              <span className="recording-dot" />
              <span className="recording-time">{formatRecordingTime(recordingSeconds)}</span>
              <button
                className="recording-cancel"
                onClick={() => stopRecording(true)}
                title="Cancel"
              >
                🗑
              </button>
            </div>
          )}
        </div>

        {/* Send button */}
        {isRecording ? (
          <button
            className="send-button"
            onClick={() => stopRecording(false)}
            title="Send voice message"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <path d="M22 2L11 13M22 2L15 22L11 13M22 2L2 9L11 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        ) : (message.trim() || selectedFile) ? (
          <button
            className="send-button"
            onClick={handleSend}
            disabled={!isConnected}
            title="Send message"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <path d="M22 2L11 13M22 2L15 22L11 13M22 2L2 9L11 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        ) : (
          <button
            className="send-button disabled"
            disabled={true}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <path d="M22 2L11 13M22 2L15 22L11 13M22 2L2 9L11 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        )}

         {showAiMenu && (
  <div className="ai-menu" ref={aiMenuRef}>

    <button
      className="ai-menu-item"
      onClick={handleTranslate}
    >
      🌍 Translate
    </button>

    <button
      className="ai-menu-item"
      onClick={handleGrammarFix}
    >
      ✍️ Grammar Fix
    </button>

    <button
      className="ai-menu-item"
      onClick={() => handleRewrite("professional")}
    >
      💼 Professional
    </button>

    <button
      className="ai-menu-item"
      onClick={() => handleRewrite("friendly")}
    >
      😊 Friendly
    </button>

    <button
      className="ai-menu-item"
      onClick={() => handleRewrite("formal")}
    >
      📄 Formal
    </button>

  </div>
)}
      </div>
     

    {showEmojiPicker && (
  <div className="emoji-picker" ref={emojiPickerRef}>
    <Suspense fallback={<div>Loading...</div>}>
      <EmojiPicker
        onEmojiClick={handleEmojiClick}
        width={300}
        height={350}
      />
    </Suspense>
  </div>
)}
      {/* Connection status */}
      {/* {!isConnected && (
        <div className="connection-status">
          <span className="status-dot"></span>
          <span>Reconnecting...</span>
        </div>
      )} */}
    </div>
  )
}

export default MessageInput