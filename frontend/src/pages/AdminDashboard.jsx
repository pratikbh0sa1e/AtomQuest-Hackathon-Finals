import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Card, SectionLabel } from "../components/ui/";
import { socket, connectSocket, disconnectSocket } from "../socket";
import Header from "../components/Header";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:3001";

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [activeSessions, setActiveSessions] = useState([]);
  const [metrics, setMetrics] = useState({
    active_sessions_total: 0,
    connected_participants: 0,
    errors_total: 0
  });
  const [loading, setLoading] = useState(true);

  // Authenticate Agent on mount
  useEffect(() => {
    const token = localStorage.getItem("agent_token");
    if (!token) {
      console.warn("Unauthorized, redirecting to login...");
      navigate("/login");
      return;
    }

    // Connect admin websocket
    connectSocket(token, "agent", "Admin Monitor");

    // Fetch initial metrics
    fetchMetrics(token);

    socket.emit("admin:join");

    socket.on("sessions-update", ({ sessions }) => {
      console.log("Admin received sessions update:", sessions);
      setActiveSessions(sessions || []);
      setMetrics((prev) => ({
        ...prev,
        active_sessions_total: sessions.length,
        connected_participants: sessions.reduce((acc, curr) => acc + (curr.participants_count || 0), 0)
      }));
      setLoading(false);
    });

    return () => {
      socket.off("sessions-update");
      disconnectSocket();
    };
  }, [navigate]);

  const fetchMetrics = async (token) => {
    try {
      const res = await fetch(`${BACKEND_URL}/metrics`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      if (res.ok) {
        // Parse basic text/metrics or load via standard admin endpoint
        console.log("Prometheus metrics loaded");
      }
    } catch (err) {
      console.error("Failed to load metrics:", err);
    }
  };

  const handleForceEnd = async (sessionId) => {
    const token = localStorage.getItem("agent_token");
    if (!confirm(`Are you sure you want to forcibly terminate session ${sessionId}?`)) {
      return;
    }

    try {
      const res = await fetch(`${BACKEND_URL}/admin/sessions/${sessionId}/end`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      if (res.ok) {
        alert("Session terminated successfully.");
        // Optimistic UI update
        setActiveSessions((prev) => prev.filter((s) => s.id !== sessionId));
      } else {
        alert("Failed to terminate session.");
      }
    } catch (err) {
      alert("Error: Unable to connect to server.");
    }
  };

  const formatDuration = (sec) => {
    if (!sec) return "0:00";
    const mins = Math.floor(sec / 60);
    const secs = sec % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div className="min-h-screen flex flex-col bg-[var(--background)]">
      <Header />
      <div className="flex-1 max-w-5xl w-full mx-auto p-6 text-left">
        {/* Top Header */}
        <div className="flex justify-between items-center border-b border-[var(--border)] pb-6 mb-8">
          <div>
            <h1 className="font-display text-4xl mb-1">Administrative Monitor</h1>
            <p className="text-sm text-[var(--muted-foreground)]">Supervisory session termination and operational overview</p>
          </div>
        </div>

        {/* Metrics Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          <Card accentTop className="p-6">
            <span className="font-mono text-xs text-[var(--muted-foreground)] uppercase tracking-wider block mb-1">
              active_sessions_total
            </span>
            <div className="font-display text-4xl font-semibold text-[var(--accent)]">
              {activeSessions.length}
            </div>
            <p className="text-xs text-[var(--muted-foreground)] mt-2">Active calls holding SFU resources</p>
          </Card>

          <Card className="p-6">
            <span className="font-mono text-xs text-[var(--muted-foreground)] uppercase tracking-wider block mb-1">
              connected_participants
            </span>
            <div className="font-display text-4xl font-semibold">
              {metrics.connected_participants}
            </div>
            <p className="text-xs text-[var(--muted-foreground)] mt-2">Combined endpoints holding active media tunnels</p>
          </Card>

          <Card className="p-6">
            <span className="font-mono text-xs text-[var(--muted-foreground)] uppercase tracking-wider block mb-1">
              errors_total
            </span>
            <div className="font-display text-4xl font-semibold text-red-600">
              {metrics.errors_total}
            </div>
            <p className="text-xs text-[var(--muted-foreground)] mt-2">Internal errors or transport failures</p>
          </Card>
        </div>

        {/* Section divider */}
        <div className="mb-6">
          <SectionLabel>Active Session Feeds</SectionLabel>
        </div>

        {loading && activeSessions.length === 0 ? (
          <div className="text-center py-12 font-mono text-sm text-[var(--muted-foreground)]">
            Listening for active stream signals...
          </div>
        ) : activeSessions.length === 0 ? (
          <div className="text-center py-12">
            <p className="font-display text-xl italic text-[var(--muted-foreground)]">No active call sessions found on SFU.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {activeSessions.map((s) => (
              <Card key={s.id} accentTop hoverEffect className="p-6 flex flex-col justify-between">
                <div>
                  <div className="flex justify-between items-center mb-4">
                    <span className="font-mono text-xs bg-emerald-50 text-emerald-800 border border-emerald-200 px-2 py-0.5 rounded uppercase font-semibold">
                      {s.status}
                    </span>
                    <span className="font-mono text-xs text-[var(--muted-foreground)]">
                      ID: <code>{s.id}</code>
                    </span>
                  </div>

                  <div className="space-y-2 mb-6">
                    <div className="flex justify-between text-sm">
                      <span className="text-[var(--muted-foreground)]">Agent:</span>
                      <span className="font-medium text-[var(--foreground)]">{s.agent}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-[var(--muted-foreground)]">Customer:</span>
                      <span className="font-medium text-[var(--foreground)]">{s.customer}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-[var(--muted-foreground)]">Connected Duration:</span>
                      <span className="font-mono text-sm font-bold text-[var(--accent)]">
                        {formatDuration(s.duration)}
                      </span>
                    </div>
                  </div>
                </div>

                <Button 
                  onClick={() => handleForceEnd(s.id)}
                  variant="secondary"
                  className="w-full text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700 mt-2"
                >
                  Force Terminate Session
                </Button>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
