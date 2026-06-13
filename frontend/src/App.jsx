import React from "react";
import { Routes, Route, Navigate, Link } from "react-router-dom";
import AgentLogin from "./pages/AgentLogin";
import AgentDashboard from "./pages/AgentDashboard";
import CustomerJoin from "./pages/CustomerJoin";
import CallRoom from "./pages/CallRoom";
import AdminDashboard from "./pages/AdminDashboard";
import { Button, Card, SectionLabel, ToastContainer } from "./components/ui/";

// Custom SVG Icons
const ShieldIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
    strokeWidth={2}
    stroke="currentColor"
    className="w-5 h-5 text-[var(--accent)]"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z"
    />
  </svg>
);

// Custom JWT decoder
function parseJwt(token) {
  try {
    const base64Url = token.split(".")[1];
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join(""),
    );
    return JSON.parse(jsonPayload);
  } catch (e) {
    return null;
  }
}

// Protected route — agent role only (dashboard, recordings, sessions)
function ProtectedAgentRoute({ children }) {
  const token = localStorage.getItem("agent_token");
  if (!token) return <Navigate to="/login" replace />;
  const payload = parseJwt(token);
  if (!payload) return <Navigate to="/login" replace />;
  if (payload.role === "supervisor") return <Navigate to="/admin" replace />;
  if (payload.role !== "agent") return <Navigate to="/login" replace />;
  return children;
}

// Protected route — supervisor only (admin dashboard)
function ProtectedAdminRoute({ children }) {
  const token = localStorage.getItem("agent_token");
  if (!token) return <Navigate to="/login" replace />;
  const payload = parseJwt(token);
  if (!payload) return <Navigate to="/login" replace />;
  if (payload.role === "agent") return <Navigate to="/dashboard" replace />;
  if (payload.role !== "supervisor") return <Navigate to="/login" replace />;
  return children;
}

// ── Step Icons ────────────────────────────────────────────────────────────────
const StepCreateIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
  </svg>
);
const StepShareIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
    <path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.933-2.185 2.25 2.25 0 00-3.933 2.185z" />
  </svg>
);
const StepVideoIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
    <path strokeLinecap="round" strokeLinejoin="round" d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25z" />
  </svg>
);

// ── Tech Stack Data ───────────────────────────────────────────────────────────
const TECH_STACK = [
  { name: "WebRTC", desc: "Real-time media" },
  { name: "mediasoup", desc: "SFU routing" },
  { name: "Supabase", desc: "Auth & DB" },
  { name: "React", desc: "Frontend UI" },
  { name: "Socket.IO", desc: "Signaling" },
  { name: "FFmpeg", desc: "Recording" },
];

const STEPS = [
  {
    icon: <StepCreateIcon />,
    title: "Create Session",
    desc: "Agent creates a secure support session from the dashboard and receives a unique invite link.",
  },
  {
    icon: <StepShareIcon />,
    title: "Share Invite",
    desc: "Send the one-time invite link to the customer via email, chat, or any messaging channel.",
  },
  {
    icon: <StepVideoIcon />,
    title: "Connect & Resolve",
    desc: "Customer joins with one click — live video, chat, screen share, and file exchange in-browser.",
  },
];

function WelcomeSelector() {
  return (
    <div
      className="min-h-screen flex flex-col justify-between"
      style={{ background: "var(--background)" }}
    >
      {/* Header */}
      <header className="border-b border-[var(--border)] bg-white/95 backdrop-blur-md px-6 py-4 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-3">
          <div className="flex items-center gap-3">
            <span className="font-display text-2xl font-semibold tracking-tight text-[var(--foreground)]">
              NEXUS<span className="text-[var(--accent)]">.</span>
            </span>
            <span className="font-mono text-[10px] tracking-wider bg-[var(--muted)] px-2 py-0.5 rounded border border-[var(--border)] text-[var(--muted-foreground)]">
              V1.0
            </span>
          </div>
          <span className="flex items-center gap-1.5 text-xs font-mono text-[var(--muted-foreground)]">
            <ShieldIcon />
            SELF-HOSTED · ZERO THIRD-PARTY
          </span>
        </div>
      </header>

      {/* Hero Section */}
      <div className="max-w-4xl mx-auto px-6 py-20 text-center flex-grow flex flex-col justify-center">
        <div className="mb-4">
          <span className="inline-block font-mono text-[10px] tracking-[0.2em] uppercase bg-[var(--accent)]/10 text-[var(--accent)] px-3 py-1.5 rounded-full border border-[var(--accent)]/20 mb-6">
            Self-Hosted Video Support Platform
          </span>
        </div>
        <h1
          className="text-5xl md:text-6xl font-medium tracking-tight mb-4"
          style={{
            fontFamily: '"Playfair Display", serif',
            color: "var(--foreground)",
          }}
        >
          Video support, <br />
          <span className="italic text-[var(--accent)]">
            with total ownership.
          </span>
        </h1>
        <p className="text-[var(--muted-foreground)] text-lg mb-12 max-w-xl mx-auto leading-relaxed">
          Conduct, capture, and supervise live video customer calls directly in
          the browser — with zero third-party media server dependencies.
        </p>

        {/* CTA Buttons */}
        <div className="flex flex-wrap gap-4 justify-center mb-16">
          <Link to="/login">
            <Button variant="primary" className="px-8 py-3 text-base">
              Agent Console
            </Button>
          </Link>
          <Link to="/join">
            <Button variant="secondary" className="px-8 py-3 text-base">
              Join as Customer
            </Button>
          </Link>
        </div>

        {/* How It Works */}
        <div className="mb-20">
          <SectionLabel className="mb-8">How It Works</SectionLabel>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-left">
            {STEPS.map((step, i) => (
              <Card key={i} hoverEffect className="p-6 bg-white relative overflow-hidden">
                <div className="absolute top-4 right-4 font-mono text-[40px] font-bold text-[var(--accent)]/10 leading-none select-none">
                  {String(i + 1).padStart(2, "0")}
                </div>
                <div className="w-10 h-10 rounded-lg bg-[var(--accent)]/10 border border-[var(--accent)]/20 flex items-center justify-center text-[var(--accent)] mb-4">
                  {step.icon}
                </div>
                <h3 className="font-display text-lg font-medium mb-2">
                  {step.title}
                </h3>
                <p className="text-sm text-[var(--muted-foreground)] leading-relaxed">
                  {step.desc}
                </p>
              </Card>
            ))}
          </div>
        </div>

        {/* Role Entry Cards */}
        <SectionLabel className="mb-8">Get Started</SectionLabel>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-left mb-16">
          {/* Agent Login Entry */}
          <Card
            accentTop
            hoverEffect
            className="p-6 flex flex-col justify-between bg-white"
          >
            <div>
              <h3 className="font-display text-xl font-medium mb-2">
                Support Agent
              </h3>
              <p className="text-sm text-[var(--muted-foreground)] mb-6">
                Create call sessions, generate customer invites, record
                sessions, and end calls.
              </p>
            </div>
            <Link to="/login" className="w-full">
              <Button variant="primary" className="w-full">
                Enter Agent Console
              </Button>
            </Link>
          </Card>

          {/* Customer Joining Portal */}
          <Card
            hoverEffect
            className="p-6 flex flex-col justify-between bg-white"
          >
            <div>
              <h3 className="font-display text-xl font-medium mb-2">
                Customer Client
              </h3>
              <p className="text-sm text-[var(--muted-foreground)] mb-6">
                Have an invite link from your support agent? Join the video
                call directly from your browser.
              </p>
            </div>
            <Link to="/join" className="w-full">
              <Button variant="secondary" className="w-full">
                Join Support Call
              </Button>
            </Link>
          </Card>

          {/* Admin Supervisor */}
          <Card
            hoverEffect
            className="p-6 flex flex-col justify-between bg-white"
          >
            <div>
              <h3 className="font-display text-xl font-medium mb-2">
                Supervisor
              </h3>
              <p className="text-sm text-[var(--muted-foreground)] mb-6">
                Oversee concurrent support streams, inspect metrics, and
                force-terminate calls.
              </p>
            </div>
            <Link to="/login" className="w-full">
              <Button variant="secondary" className="w-full">
                Supervisor Monitor
              </Button>
            </Link>
          </Card>
        </div>

        {/* Tech Stack */}
        <SectionLabel className="mb-6">Built With</SectionLabel>
        <div className="flex flex-wrap gap-3 justify-center">
          {TECH_STACK.map((tech) => (
            <div
              key={tech.name}
              className="flex items-center gap-2 px-3 py-2 rounded-lg border bg-white hover:border-[var(--accent)]/40 transition-colors"
              style={{ borderColor: "var(--border)" }}
            >
              <span className="font-mono text-xs font-semibold text-[var(--accent)]">
                {tech.name}
              </span>
              <span className="text-[10px] text-[var(--muted-foreground)]">
                {tech.desc}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-[var(--border)] bg-[var(--muted)] py-6">
        <div className="max-w-7xl mx-auto px-6 text-center md:flex md:justify-between md:items-center">
          <p className="text-xs text-[var(--muted-foreground)]">
            Nexus — Self-hosted WebRTC SFU Gateway. Built for compliance.
          </p>
          <div className="flex gap-6 justify-center text-xs text-[var(--muted-foreground)] font-mono mt-4 md:mt-0">
            <span>DB: SUPABASE PG</span>
            <span>SFU: MEDIASOUP</span>
            <span>REC: FFMPEG PlainRTP</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

function App() {
  return (
    <>
      <div className="paper-overlay" />
      <div className="ambient-glow" />
      <ToastContainer />

      <Routes>
        {/* Public Routes */}
        <Route path="/" element={<WelcomeSelector />} />
        <Route path="/login" element={<AgentLogin />} />
        <Route path="/join" element={<CustomerJoin />} />

        {/* Protected Routes (Agent console) */}
        <Route
          path="/dashboard"
          element={
            <ProtectedAgentRoute>
              <AgentDashboard />
            </ProtectedAgentRoute>
          }
        />
        <Route
          path="/supervisor"
          element={
            <ProtectedAdminRoute>
              <AdminDashboard />
            </ProtectedAdminRoute>
          }
        />
        <Route
          path="/admin"
          element={
            <ProtectedAdminRoute>
              <AdminDashboard />
            </ProtectedAdminRoute>
          }
        />

        {/* Dynamic call room */}
        <Route path="/call/:sessionId" element={<CallRoom />} />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}

export default App;
