# Nexus / AtomQuest Platform

**AtomQuest** is a state-of-the-art WebRTC-based customer support platform built for high-performance, real-time video, audio, and chat interactions. It uses an SFU (Selective Forwarding Unit) architecture to handle media streams efficiently, alongside a robust WebSocket signaling server.

---

## 🌟 Key Features

- **Real-Time Video & Audio:** High-quality, low-latency communication powered by the Mediasoup SFU.
- **In-Call Text Chat:** Real-time messaging with file-sharing capabilities via Socket.IO.
- **Call Recording:** Server-side stream recording saved directly to secure cloud storage.
- **Agent Dashboard:** Comprehensive control panel for agents to create invite links, monitor active sessions, and review historical chat logs and recordings.
- **Admin/Supervisor Monitor:** Live operations center for supervisors to view ongoing sessions and forcibly terminate them if necessary.
- **Mobile Responsive:** Adaptive UI with a dedicated mobile drawer for chat while in a video session.
- **Resilient Connectivity:** Graceful network drop handling with silent reconnect timers.

---

## 🏗️ Architecture & Implementation

The repository is structured into two main microservices:

```text
├── backend/                # Node.js + Express + Socket.IO + Mediasoup
│   ├── handlers/           # WebSocket signaling logic (join, media, chat)
│   ├── middleware/         # RBAC and JWT Authentication
│   ├── routes/             # REST APIs (auth, sessions, recordings, admin)
│   └── server.js           # Main application entry point
└── frontend/               # React + Vite + Tailwind CSS
    ├── src/
    │   ├── components/     # Reusable UI components (ControlBar, ChatPanel, etc.)
    │   ├── pages/          # Full page views (Dashboard, CallRoom, Admin, Login)
    │   └── App.jsx         # Routing and global state
```

### ⚙️ How It Works

1. **Authentication:** Agents log in using their credentials (verified against Supabase) and receive a JWT.
2. **Session Creation:** Agents generate unique, one-time invite links valid for 24 hours.
3. **Signaling & WebRTC:** When a customer joins, the frontend establishes a WebSocket connection. Mediasoup provisions a WebRTC `SendTransport` and `RecvTransport`.
4. **Recording & Storage:** Agents can toggle recordings. The server securely records the WebRTC streams and offloads the compiled `.webm` files to Supabase Storage, guarded by signed URLs.

---

## 🛠️ Technology Stack

| Layer         | Technology                                                                                 |
| ------------- | ------------------------------------------------------------------------------------------ |
| Frontend      | React 18, Vite, Tailwind CSS, React Router v6, Lucide Icons, Axios                         |
| Backend       | Node.js, Express, Socket.IO, Mediasoup (WebRTC SFU)                                        |
| Database      | PostgreSQL via Supabase (service-role key, RLS-aware)                                      |
| Storage       | Supabase Storage (for video recordings and shared files)                                   |
| Infrastructure| Google Cloud Platform (Compute Engine for Backend), Vercel (for Frontend)                  |

---

## 🚀 Quick Start Guide

### Prerequisites
- **Node.js** (v18+)
- **Supabase Project** (Database & Storage)

### 1. Database Setup (Supabase)
1. Go to your Supabase Dashboard -> **SQL Editor**.
2. Run the scripts found in `backend/migrations/` sequentially to create the required tables and functions.

### 2. Backend Initialization
```bash
cd backend
npm install
cp .env.example .env
```
Edit `.env` with your values:
```env
# Supabase Configuration (Get these from your Supabase Project Settings -> API)
SUPABASE_URL=your_supabase_project_url
SUPABASE_SERVICE_KEY=your_supabase_service_role_key

# Security
JWT_SECRET=a_secure_random_string_for_agent_auth

# WebRTC & Mediasoup Configuration
ANNOUNCED_IP=127.0.0.1  # For local development. In production (GCP), set this to your VM's External IP!
```
Start the backend server:
```bash
npm run dev   # runs on http://localhost:3001
```

### 3. Frontend Initialization
```bash
cd frontend
npm install
cp .env.example .env
```
Edit `.env` with your values:
```env
# Supabase Configuration
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_public_key

# Backend API URL
VITE_BACKEND_URL=http://localhost:3001  # In production, point to your GCP Server IP.
```
Start the frontend development server:
```bash
npm run dev
# Runs on http://localhost:5173
```

---

## ⚠️ Known Limitations & Deployment Notes

- **GCP Free Tier Limitations:** The backend is designed to run on a Google Cloud Platform `e2-micro` instance using the "Always Free" tier. Due to these limited resources (1GB RAM, shared CPU), the server may experience bottlenecks or network lag if a large number of concurrent users join video rooms simultaneously.
- **WebRTC Port Requirements:** Deploying a Mediasoup SFU requires specific open UDP ports (typically `10000-10100`) for WebRTC traffic. This limits hosting options (e.g., standard Serverless platforms like Vercel or Render will not work for the backend; a dedicated Virtual Machine on GCP/AWS/DigitalOcean is required).
- **File Limits:** In-call file sharing is currently subject to size limits enforced by the Socket.IO payload limits to prevent crashing the micro-instance.
- **Safari Compatibility:** Certain strict auto-play and permission restrictions in iOS Safari require explicit user interaction to initialize audio/video tracks.
