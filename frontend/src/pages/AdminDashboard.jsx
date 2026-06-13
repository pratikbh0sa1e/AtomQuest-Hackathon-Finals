import React, { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  Button,
  Card,
  SectionLabel,
  ConfirmDialog,
  SkeletonCard,
  SkeletonSessionCard,
} from "../components/ui/";
import { connectSocket, disconnectSocket } from "../socket";
import Header from "../components/Header";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "";

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [activeSessions, setActiveSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const pollRef = useRef(null);
  const [confirmEnd, setConfirmEnd] = useState(null); // sessionId to confirm

  // Fetch active sessions via REST
  const fetchSessions = useCallback(
    async (token) => {
      try {
        const res = await fetch(`${BACKEND_URL}/admin/sessions`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.status === 401 || res.status === 403) {
          navigate("/login");
          return;
        }
        if (!res.ok) {
          setError("Failed to load sessions.");
          return;
        }
        const data = await res.json();
        setActiveSessions(Array.isArray(data) ? data : []);
        setError("");
      } catch {
        setError("Unable to reach server.");
      } finally {
        setLoading(false);
      }
    },
    [navigate],
  );

  useEffect(() => {
    const token = localStorage.getItem("agent_token");
    if (!token) {
      navigate("/login");
      return;
    }

    // 1. Fetch immediately via REST
    fetchSessions(token);

    // 2. Poll every 5s so duration updates and new sessions appear
    pollRef.current = setInterval(() => fetchSessions(token), 5000);

    // 3. Also connect socket to get real-time sessions-update events
    const role = localStorage.getItem("agent_role") || "supervisor";
    const name = localStorage.getItem("agent_name") || "Supervisor";
    const s = connectSocket(token, role, name);

    const onSessionsUpdate = ({ sessions }) => {
      setActiveSessions(sessions || []);
      setLoading(false);
    };

    s.on("sessions-update", onSessionsUpdate);

    const emitJoin = () => s.emit("admin:join");
    if (s.connected) {
      emitJoin();
    } else {
      s.once("connect", emitJoin);
    }

    return () => {
      clearInterval(pollRef.current);
      s.off("sessions-update", onSessionsUpdate);
      disconnectSocket();
    };
  }, [navigate, fetchSessions]);

  const handleForceEnd = async (sessionId) => {
    const token = localStorage.getItem("agent_token");
    try {
      const res = await fetch(
        `${BACKEND_URL}/admin/sessions/${sessionId}/end`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        },
      );

      if (res.ok) {
        // Optimistic remove
        setActiveSessions((prev) => prev.filter((s) => s.id !== sessionId));
      } else {
        const data = await res.json().catch(() => ({}));
        alert(`Failed: ${data.error || res.statusText}`);
      }
    } catch {
      alert("Network error — could not reach server.");
    }
    setConfirmEnd(null);
  };

  const formatDuration = (sec) => {
    if (!sec || sec < 0) return "0:00";
    const mins = Math.floor(sec / 60);
    const secs = sec % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ background: "var(--background)" }}
    >
      <Header />

      <main className="flex-1 max-w-6xl mx-auto w-full px-6 py-10">
        {/* Title */}
        <div
          className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8 pb-6 border-b"
          style={{ borderColor: "var(--border)" }}
        >
          <div>
            <h1
              className="text-4xl font-semibold mb-1"
              style={{ fontFamily: '"Playfair Display", serif' }}
            >
              Supervisor Monitor
            </h1>
            <p className="text-sm text-[var(--muted-foreground)]">
              Live sessions · Force-terminate · Observability
            </p>
          </div>
          <Button
            variant="secondary"
            onClick={() => fetchSessions(localStorage.getItem("agent_token"))}
          >
            Refresh
          </Button>
        </div>

        {/* Metrics strip */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-10">
          {loading ? (
            <>
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
            </>
          ) : (
            <>
              <Card accentTop className="p-5">
                <p className="font-mono text-xs text-[var(--muted-foreground)] uppercase tracking-widest mb-1">
                  Active Sessions
                </p>
                <p
                  className="text-4xl font-semibold text-[var(--accent)]"
                  style={{ fontFamily: '"Playfair Display", serif' }}
                >
                  {activeSessions.length}
                </p>
              </Card>
              <Card className="p-5">
                <p className="font-mono text-xs text-[var(--muted-foreground)] uppercase tracking-widest mb-1">
                  Connected Participants
                </p>
                <p
                  className="text-4xl font-semibold"
                  style={{ fontFamily: '"Playfair Display", serif' }}
                >
                  {activeSessions.reduce(
                    (acc, s) => acc + (s.participants_count || s.participants?.length || 0),
                    0,
                  )}
                </p>
              </Card>
              <Card className="p-5">
                <p className="font-mono text-xs text-[var(--muted-foreground)] uppercase tracking-widest mb-1">
                  Polling
                </p>
                <p className="text-sm font-mono text-emerald-600 flex items-center gap-2 mt-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse inline-block" />
                  Every 5s
                </p>
              </Card>
            </>
          )}
        </div>

        <SectionLabel className="mb-6">Live Sessions</SectionLabel>

        {error && (
          <p className="text-sm text-red-600 mb-4" role="alert">
            {error}
          </p>
        )}

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <SkeletonSessionCard />
            <SkeletonSessionCard />
          </div>
        ) : activeSessions.length === 0 ? (
          <Card className="p-12 text-center">
            <p
              className="text-xl italic text-[var(--muted-foreground)]"
              style={{ fontFamily: '"Playfair Display", serif' }}
            >
              No active sessions right now.
            </p>
            <p className="text-xs font-mono text-[var(--muted-foreground)] mt-2">
              Sessions appear here once an agent and customer are both in a
              call.
            </p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {activeSessions.map((s) => (
              <Card
                key={s.id}
                accentTop
                hoverEffect
                className="p-6 flex flex-col gap-4"
              >
                {/* Session ID + status */}
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[10px] bg-emerald-50 text-emerald-800 border border-emerald-200 px-2 py-0.5 rounded uppercase">
                    {s.status || "active"}
                  </span>
                  <code className="font-mono text-[10px] text-[var(--muted-foreground)]">
                    {s.id.slice(0, 16)}...
                  </code>
                </div>

                {/* Participants */}
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-[var(--muted-foreground)]">
                      Agent
                    </span>
                    <span className="font-medium">{s.agent || "—"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--muted-foreground)]">
                      Customer
                    </span>
                    <span className="font-medium">
                      {s.customer || "Waiting..."}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--muted-foreground)]">
                      Duration
                    </span>
                    <span className="font-mono font-bold text-[var(--accent)]">
                      {formatDuration(s.duration || 0)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--muted-foreground)]">
                      Participants
                    </span>
                    <span className="font-mono">
                      {s.participants_count || s.participants?.length || 0}
                    </span>
                  </div>
                </div>

                {/* Force end */}
                <Button
                  onClick={() => setConfirmEnd(s.id)}
                  variant="secondary"
                  className="w-full text-red-600 border-red-200 hover:bg-red-600 hover:text-white hover:border-red-600 transition-all"
                >
                  Force Terminate
                </Button>
              </Card>
            ))}
          </div>
        )}
      </main>

      <ConfirmDialog
        open={!!confirmEnd}
        title="Force Terminate Session"
        message={`Are you sure you want to force-terminate session ${confirmEnd?.slice(0, 8)}...? This will immediately disconnect all participants.`}
        confirmText="Terminate"
        cancelText="Cancel"
        variant="danger"
        onConfirm={() => handleForceEnd(confirmEnd)}
        onCancel={() => setConfirmEnd(null)}
      />
    </div>
  );
}
