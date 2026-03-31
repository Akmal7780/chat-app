![Django](https://img.shields.io/badge/Django-Backend-green)
![React](https://img.shields.io/badge/React-Frontend-blue)
![Docker](https://img.shields.io/badge/Docker-Containerized-blue)
![ClamAV](https://img.shields.io/badge/Security-ClamAV-red)
# 💬 Real-Time Chat Application (Django + Channels + React + Celery + ClamAV + MinIO)

A modern real-time chat application built with **Django + Channels + React**.
Supports messaging, replies, reactions, file sharing, and real-time updates.

Supports **JWT authentication and Google OAuth login**.

---

## 🚀 Features

* ⚡ Real-time messaging (WebSocket)
* 🔐 Authentication (JWT + Google OAuth)
* ✅ Message status (sent, delivered, read)
* 💬 Reply system (Telegram-style)
* 😀 Reactions system
* 📎 File & image sharing
* 👀 Typing indicator
* 🟢 Online/offline status
* 🗑️ Edit & delete messages
* 👥 Group chat support
* 🧩 Chunk file upload (large files support)
* 🛡️ Virus scanning with ClamAV (async via Celery)
* ☁️ Object storage with MinIO (S3 compatible)
* ⚡ Background task processing (Celery + Redis)
* 🔍 Message search functionality

---

## 🛠️ Tech Stack

### Backend

* Django
* Django Channels
* Django REST Framework
* PostgreSQL
* Redis

### Frontend

* React (Vite)
* Axios
* WebSocket API

### Authentication

* JWT (SimpleJWT)
* Google OAuth 2.0

---

### Infrastructure

* Docker & Docker Compose
* MinIO (S3 storage)
* ClamAV (virus scanning)
* Celery (background jobs)

## 🧠 Architecture Overview

- Django REST API handles business logic
- Django Channels manages WebSocket connections
- Redis is used as a message broker and channel layer
- Celery processes background tasks (file scanning)
- MinIO stores uploaded files
- ClamAV scans files for viruses

## 📁 Project Structure

```
chat-app/
│
├── backend/
│   ├── apps/
│   ├── config/
│   ├── manage.py
│
├── chat-frontend/
│   ├── src/
│   ├── public/
│
├── screenshots/
│   ├── login.jpg
│   ├── chat-dashboard.jpg
│   ├── private-chat.jpg
│   ├── group-chat.jpg
│
└── README.md
```

---

## ⚙️ Setup Instructions

### 1. Clone the repository

```bash
git clone https://github.com/your-username/chat-app.git
cd chat-app
```

---

### 2. Backend Setup (Django + Channels)

```bash
cd backend

python -m venv venv
venv\Scripts\activate   # Windows
# source venv/bin/activate  # Linux/Mac

pip install -r requirements.txt
```

Create `.env` file:

```
SECRET_KEY=your-secret-key
DEBUG=True

DB_NAME=chatdb
DB_USER=postgres
DB_PASSWORD=your_password
DB_HOST=db
DB_PORT=5432

MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_BUCKET_NAME=chatapp
MINIO_ENDPOINT=http://minio:9000

MINIO_REGION=us-east-1

CELERY_BROKER_URL=redis://redis:6379/0
```

Apply migrations:

```bash
python manage.py migrate
```

Run backend (ASGI server with Daphne):

```bash
python -m daphne -b 127.0.0.1 -p 8000 config.asgi:application
```

---

### 3. Frontend Setup (React + Vite)

```bash
cd chat-frontend
npm install
npm run dev
```

Create `.env`:

```
VITE_API_URL=http://127.0.0.1:8000/api
VITE_GOOGLE_CLIENT_ID=your_google_client_id
```

---

## 🐳 Run with Docker (Recommended)

Make sure you have Docker and Docker Compose installed.

```bash
docker-compose up --build

## 🔄 Development Workflow

* Backend: http://127.0.0.1:8000
* Frontend: http://localhost:5173
* WebSocket: ws://127.0.0.1:8000/ws/chat/
```
---

## 🔐 Authentication

This project supports two authentication methods:

### 1. Email & Password

* Traditional login system using JWT

### 2. Google OAuth

* Secure login using Google account
* Implemented using Google OAuth 2.0

> ⚠️ To use Google login, you must provide your own Google Client ID in `.env`

---

## 📸 Screenshots

### 🔐 Login Page

<p align="center">
  <img src="./screenshots/login.jpg" width="700"/>
</p>

---

### 🏠 Chat Dashboard

<p align="center">
  <img src="./screenshots/chat-dashboard.jpg" width="700"/>
</p>

---

### 💬 Private Chat

<p align="center">
  <img src="./screenshots/private-chat.jpg" width="700"/>
</p>

---

### 👥 Group Chat

<p align="center">
  <img src="./screenshots/group-chat.jpg" width="700"/>
</p>


---
## 🛡️ Security

- All uploaded files are scanned using ClamAV
- Infected files are automatically deleted
- Asynchronous scanning via Celery workers
- Rate limiting applied using DRF throttling
- JWT-based secure authentication
---

---
## ⚡ Highlights

- Production-ready scalable architecture
- Real-time messaging with WebSockets
- Secure file uploads with antivirus scanning (ClamAV)
- Asynchronous processing with Celery & Redis
- Object storage integration with MinIO (S3-compatible)
---
## 📌 Future Improvements
* 🎤 Voice messages
* 📹 Video calls
* 📱 Mobile app (React Native)

---

## 👨‍💻 Author

**Akmal Axrorov**

---

## ⭐ Support

If you like this project, give it a ⭐ on GitHub!
