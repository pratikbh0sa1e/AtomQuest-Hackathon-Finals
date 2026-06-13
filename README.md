# Nexus Platform

Nexus is a state-of-the-art WebRTC-based customer support platform built for high-performance, real-time video, audio, and chat interactions. It uses an SFU (Selective Forwarding Unit) architecture to handle media streams efficiently, alongside a robust WebSocket signaling server and an AI service for call analytics.

## ✨ Features

- **Real-Time Video & Audio:** High-quality, low-latency communication powered by Mediasoup SFU.
- **In-Call Text Chat:** Real-time messaging with file-sharing capabilities via Socket.IO.
- **Call Recording:** Server-side stream recording saved directly to secure cloud storage.
- **Agent Dashboard:** Comprehensive control panel for agents to create invite links, monitor active sessions, and review historical chat logs and recordings.
- **Admin/Supervisor Monitor:** Live operations center for supervisors to view ongoing sessions and forcibly terminate them if necessary.
- **AI Analytics Integration:** Python-based AI service for automated session transcription and summarization.
- **Mobile Responsive:** Adaptive UI with a dedicated mobile drawer for chat while in a video session.
- **Resilient Connectivity:** Graceful network drop handling with silent reconnect timers.

## 🏗️ Project Scaffold

The repository is structured into three main microservices:

```
├── backend/                # Node.js + Express + Socket.IO + Mediasoup
│   ├── handlers/           # WebSocket signaling logic (join, media, chat)
│   ├── middleware/         # RBAC and JWT Authentication
│   ├── routes/             # REST APIs (auth, sessions, recordings, admin)
│   └── server.js           # Main application entry point
├── frontend/               # React + Vite + Tailwind CSS
│   ├── src/
│   │   ├── components/     # Reusable UI components (ControlBar, ChatPanel, etc.)
│   │   ├── pages/          # Full page views (Dashboard, CallRoom, Admin, Login)
│   │   └── App.jsx         # Routing and global state
└── ai-service/             # Python backend for AI transcription & summaries
    └── main.py             # Entry point for processing recording webhooks
```

## ⚙️ How It Works

1. **Authentication:** Agents log in using their credentials (verified against Supabase) and receive a JWT.
2. **Session Creation:** Agents generate unique, one-time invite links valid for 24 hours.
3. **Signaling & WebRTC:** When a customer joins, the frontend establishes a WebSocket connection. Mediasoup provisions a WebRTC `SendTransport` and `RecvTransport`. Audio is prioritized in the SDP ordering to ensure flawless synchronization.
4. **Recording & Storage:** Agents can toggle recordings. The server securely records the WebRTC streams and offloads the compiled `.webm` files to Supabase Storage, guarded by signed URLs.
5. **AI Processing:** Upon session completion, the `ai-service` can fetch the recording to generate automated transcripts and call summaries.

## 🚀 Setup Steps

### Prerequisites
- Node.js (v18+)
- Python (3.10+)
- Supabase Project (Database & Storage)

### 1. Environment Variables
You must set up `.env` files in both the frontend and backend based on their respective `.env.example` templates.
- **Backend**: Requires `JWT_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, and Mediasoup config variables.
- **Frontend**: Requires `VITE_BACKEND_URL` and `VITE_SUPABASE_URL`.

### 2. Install Dependencies
Open two terminals and install dependencies for both the frontend and backend:
```bash
# Terminal 1: Backend
cd backend
npm install

# Terminal 2: Frontend
cd frontend
npm install
```

### 3. Run the Servers
```bash
# Terminal 1: Backend (runs on port 3001)
npm run dev
# or
nodemon server.js

# Terminal 2: Frontend (runs on port 5173)
npm run dev
```

## ⚠️ Known Limitations
- **Deployment Complexity:** Deploying a Mediasoup SFU requires specific open UDP ports (typically `10000-10100`) for WebRTC traffic. This limits hosting options (e.g., standard Serverless platforms like Vercel or Heroku will not work for the backend; a VPS or Dockerized container on AWS/DigitalOcean is required).
- **File Limits:** In-call file sharing is currently subject to size limits enforced by the Socket.IO payload limits, though this can be configured in `server.js`.
- **Safari Compatibility:** Certain strict auto-play and permission restrictions in iOS Safari require explicit user interaction to initialize audio/video tracks.
