import React from "react";
import { Routes, Route, Navigate, Link } from "react-router-dom";
import AgentLogin from "./pages/AgentLogin";
import AgentDashboard from "./pages/AgentDashboard";
import CustomerJoin from "./pages/CustomerJoin";
import CallRoom from "./pages/CallRoom";
import AdminDashboard from "./pages/AdminDashboard";
import { Button, Card, SectionLabel } from "./components/ui/";

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

  console.log("[ProtectedAdminRoute] token exists:", !!token);

  if (!token) {
    console.log("[ProtectedAdminRoute] No token, redirecting to /login");
    return <Navigate to="/login" replace />;
  }

  const payload = parseJwt(token);
  console.log("[ProtectedAdminRoute] payload:", payload);

  if (!payload) {
    console.log("[ProtectedAdminRoute] Invalid token, redirecting to /login");
    return <Navigate to="/login" replace />;
  }

  if (payload.role === "agent") {
    console.log(
      "[ProtectedAdminRoute] Agent trying to access admin, redirecting to /dashboard",
    );
    return <Navigate to="/dashboard" replace />;
  }

  if (payload.role !== "supervisor") {
    console.log(
      "[ProtectedAdminRoute] Role is not supervisor, got:",
      payload.role,
    );
    return <Navigate to="/login" replace />;
  }

  console.log("[ProtectedAdminRoute] Access granted for supervisor");
  return children;
}

function WelcomeSelector() {
  const [showRequestForm, setShowRequestForm] = React.useState(false);
  const [requestSubmitted, setRequestSubmitted] = React.useState(false);

  const handleCustomerRequest = (e) => {
    e.preventDefault();
    setRequestSubmitted(true);
  };

  return (
    <div
      className="min-h-screen flex flex-col justify-between"
      style={{ background: "var(--background)" }}
    >
      {/* Header */}
      <header className="border-b border-[var(--border)] bg-white/95 px-6 py-4 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-3">
          <div className="flex items-center gap-3">
            <span className="font-display text-2xl font-semibold tracking-tight text-[var(--foreground)]">
              AURA<span className="text-[var(--accent)]">.</span>
            </span>
            <span className="font-mono text-[10px] tracking-wider bg-[var(--muted)] px-2 py-0.5 rounded border border-[var(--border)] text-[var(--muted-foreground)]">
              V1.0
            </span>
          </div>
          <span className="flex items-center gap-1.5 text-xs font-mono text-[var(--muted-foreground)]">
            <ShieldIcon />
            SFU CHANNEL: ROUTED THROUGH SERVER
          </span>
        </div>
      </header>

      {/* Hero Welcome */}
      <div className="max-w-3xl mx-auto px-6 py-16 text-center flex-grow flex flex-col justify-center">
        <h1
          className="text-5xl md:text-6xl font-medium tracking-tight mb-4"
          style={{
            fontFamily: '"Playfair Display", serif',
            color: "var(--foreground)",
          }}
        >
          Self-Hosted Video Support, <br />
          <span className="italic text-[var(--accent)]">
            built with total ownership.
          </span>
        </h1>
        <p className="text-[var(--muted-foreground)] text-lg mb-12 max-w-lg mx-auto">
          Conduct, capture, and supervise live video customer calls directly in
          the browser—with zero third-party media server dependencies.
        </p>

        <div className="mb-8">
          <SectionLabel>Choose Testing Console</SectionLabel>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-left">
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
                Need help? Raise a support ticket and connect instantly with an
                agent via video call.
              </p>
            </div>

            {!showRequestForm ? (
              <div className="flex flex-col gap-3">
                <Button
                  variant="primary"
                  className="w-full"
                  onClick={() => setShowRequestForm(true)}
                >
                  Raise Support Request
                </Button>
                <Link to="/join" className="w-full">
                  <Button variant="secondary" className="w-full">
                    I have an Invite Link
                  </Button>
                </Link>
              </div>
            ) : requestSubmitted ? (
              <div className="bg-[var(--muted)] border border-[var(--border)] rounded-lg p-4 text-center">
                <p className="text-sm text-[var(--foreground)] font-medium mb-1">
                  Request Sent!
                </p>
                <p className="text-xs text-[var(--muted-foreground)]">
                  An agent will review your request and send an invite link
                  shortly.
                </p>
              </div>
            ) : (
              <form
                onSubmit={handleCustomerRequest}
                className="flex flex-col gap-3 animate-in fade-in slide-in-from-bottom-2"
              >
                <input
                  type="text"
                  placeholder="Describe your issue..."
                  required
                  className="w-full bg-white border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--foreground)] focus:outline-none focus:border-[var(--accent)] transition-colors"
                />
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    className="flex-1"
                    onClick={() => setShowRequestForm(false)}
                  >
                    Back
                  </Button>
                  <Button type="submit" variant="primary" className="flex-1">
                    Submit
                  </Button>
                </div>
              </form>
            )}
          </Card>

          {/* Admin Supervisor Lobbies */}
          <Card
            hoverEffect
            className="p-6 flex flex-col justify-between bg-white"
          >
            <div>
              <h3 className="font-display text-xl font-medium mb-2">
                Supervisor Admin
              </h3>
              <p className="text-sm text-[var(--muted-foreground)] mb-6">
                Oversee concurrent support streams, inspect metrics, and
                force-terminate calls.
              </p>
            </div>
            <Link to="/admin" className="w-full">
              <Button variant="secondary" className="w-full">
                Supervisor Monitor
              </Button>
            </Link>
          </Card>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-[var(--border)] bg-[var(--muted)] py-6">
        <div className="max-w-7xl mx-auto px-6 text-center md:flex md:justify-between md:items-center">
          <p className="text-xs text-[var(--muted-foreground)]">
            Aura self-hosted WebRTC SFU Gateway. Built for compliance.
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

        {/* Dynamic call room — replace history so back button goes to dashboard/home not back into call */}
        <Route path="/call/:sessionId" element={<CallRoom />} />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}

export default App;
