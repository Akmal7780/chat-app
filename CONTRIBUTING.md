# 🤝 Contribution Guide

Welcome to the **Real-Time Chat Application** 🚀

This project follows a structured workflow to ensure clean, scalable, and production-ready code.

Please read and follow these rules before contributing.

---

# 🚀 Workflow

1. Pick an issue from GitHub Issues
2. Create a new branch from `develop`
3. Work on your assigned feature
4. Commit your changes properly
5. Push your branch
6. Open a Pull Request (PR)
7. Wait for review
8. Merge after approval

---

# 🌿 Branch Naming Convention

Use clear and meaningful branch names:

## 🔹 Feature
feature/chat-ui  
feature/message-input  
feature/typing-indicator  
feature/message-reactions  
feature/file-upload-ui  

## 🔹 Fix
fix/socket-reconnect  
fix/message-duplicate  
fix/scroll-bug  

## 🔹 Refactor
refactor/message-logic  
refactor/socket-handler  

❌ Avoid:
- update
- test
- new
- changes

---

# 🧾 Commit Message Convention

Use this format:

feat: add typing indicator  
fix: resolve socket reconnect issue  
refactor: improve message logic  
style: format code  
docs: update README  

❌ Avoid:
- update
- fix bug
- changes

---

# 📁 Project Structure

chat-app/

├── backend/          # Django + Channels  
├── chat-frontend/    # React (Frontend)  
└── README.md  

---

# ⚠️ Important Rules

## 🔒 Backend Rules

- Backend is managed by the project owner
- Do NOT modify backend code unless assigned
- Any backend change requires approval

---

## 🎨 Frontend Rules

- Work ONLY inside `chat-frontend/`
- Do NOT modify backend files
- Follow API & WebSocket contract

---

# 🔗 API & WebSocket Contract

All frontend work must follow backend API.

## REST API

GET /messages/:conversationId  
POST /messages  

## WebSocket Events

message  
read  
typing_start  
typing_stop  
reaction  
message_edited  
message_deleted  

❗ Do NOT change API or events without discussion.

---

# 📦 File Upload Rules

- Frontend sends file → backend
- Backend uploads to storage (MinIO)
- Backend returns URL
- Frontend uses URL

❗ Frontend should NOT directly access storage

---

# 🧪 Testing

Before creating a PR:

- Ensure code runs without errors
- Check browser console (no errors)
- Test feature manually
- Verify UI works correctly

---

# 📸 Pull Request Rules

Every PR must include:

- Clear description
- What was implemented
- How to test
- Screenshots (if UI change)

Example:

Closes #12

---

# ❌ What NOT to Do

- Do NOT push directly to main
- Do NOT push directly to develop
- Do NOT create large PRs
- Do NOT change unrelated code
- Do NOT break existing features

---

# 💬 Communication

- Ask if something is unclear
- Discuss before big changes
- Keep PR comments clean
- Respect team workflow

---

# 🎯 Goal

We aim to build:

- ⚡ Real-time system
- 🧠 Scalable architecture
- 💎 Production-ready application

---

# 🚀 Final Note

Clean code + Clear workflow = Strong project

Let’s build something powerful together 🔥