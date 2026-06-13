import React, { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Card, SectionLabel } from "../components/ui/";
import Header from "../components/Header";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL ?? "http://localhost:3001";

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

function formatDate(isoString) {
  if (!isoString) return "—";
  const d = new Date(isoString);
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function StatusBadge({ status }) {
  const styles = {
    pending: "bg-[var(--muted)] text-[var(--muted-foreground)]",
    active: "bg-green-100 text-green-800",
    ended: "bg-[var(--muted)] text-[var(--muted-foreground)] opacity-60",
  };
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium uppercase tracking-wider ${
        styles[status] ?? styles.pending
      }`}
    >
      {status}
    </span>
  );
}

// Copy to clipboard utility with fallback
async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // fallback for non-HTTPS
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Invite URL Card (shown inline after creating a session)
// ──────────────────────────────────────────────────────────────────────────────

function InviteCard({ inviteUrl, onDismiss }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    const ok = await copyToClipboard(inviteUrl);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <Card
      accentTop
      className="p-5 mb-8 border-[var(--accent)]"
      style={{ borderColor: "var(--accent)" }}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <p
            className="text-sm font-semibold mb-1"
            style={{
              fontFamily: '"IBM Plex Mono", monospace',
              color: "var(--accent)",
              textTransform: "uppercase",
              letterSpacing: "0.1em",
            }}
          >
            Session Created — Invite Link
          </p>
          <p className="text-sm text-[var(--muted-foreground)] mb-3">
            Share this URL with the customer. It is valid for 24 hours and can
            only be used once.
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            <code
              className="flex-1 min-w-0 truncate text-xs px-3 py-2 rounded-md border"
              style={{
                background: "var(--muted)",
                borderColor: "var(--border)",
                fontFamily: '"IBM Plex Mono", monospace',
                color: "var(--foreground)",
              }}
              title={inviteUrl}
            >
              {inviteUrl}
            </code>
            <Button
              variant="secondary"
              className="shrink-0"
              onClick={handleCopy}
              aria-label="Copy invite URL"
            >
              {copied ? "Copied ✓" : "Copy Link"}
            </Button>
          </div>
        </div>
        <button
          onClick={onDismiss}
          aria-label="Dismiss invite card"
          className="shrink-0 text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors text-lg leading-none mt-0.5"
        >
          ×
        </button>
      </div>
    </Card>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Session Card (active sessions list)
// ──────────────────────────────────────────────────────────────────────────────

function SessionCard({ session, onJoin }) {
  return (
    <Card accentTop hoverEffect className="p-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        {/* Left: IDs + created time */}
        <div className="min-w-0 flex-1">
          <p
            className="text-xs font-medium tracking-widest uppercase mb-0.5 truncate"
            style={{
              fontFamily: '"IBM Plex Mono", monospace',
              color: "var(--accent)",
            }}
          >
            {session.id}
          </p>
          <p className="text-xs text-[var(--muted-foreground)]">
            Created: {formatDate(session.created_at)}
          </p>
        </div>

        {/* Right: participant count + status badge */}
        <div className="flex items-center gap-4 shrink-0">
          <div className="text-right mr-2">
            <p
              className="text-2xl font-semibold leading-none"
              style={{
                fontFamily: '"Playfair Display", serif',
                color: "var(--foreground)",
              }}
            >
              {session.participant_count ?? 0}
            </p>
            <p className="text-xs text-[var(--muted-foreground)] mt-0.5">
              participants
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <StatusBadge status={session.status} />
            {session.status !== "ended" && (
              <Button
                variant="primary"
                className="min-h-[36px] py-1 px-3 text-xs"
                onClick={() => onJoin(session.id)}
                aria-label={`Join call session ${session.id}`}
              >
                Join Call
              </Button>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Session History Table Row
// ──────────────────────────────────────────────────────────────────────────────

function HistoryRow({ session, isLast }) {
  return (
    <tr
      className={!isLast ? "border-b border-[var(--border)]" : ""}
      style={{ borderColor: "var(--border)" }}
    >
      <td
        className="py-3 pr-4 text-xs"
        style={{
          fontFamily: '"IBM Plex Mono", monospace',
          color: "var(--muted-foreground)",
        }}
      >
        {formatDate(session.created_at)}
      </td>
      <td className="py-3 pr-4">
        <code
          className="text-xs"
          style={{
            fontFamily: '"IBM Plex Mono", monospace',
            color: "var(--foreground)",
          }}
        >
          {session.id}
        </code>
      </td>
      <td className="py-3 pr-4">
        <span
          className="tabular-nums text-sm font-semibold"
          style={{
            fontFamily: '"Playfair Display", serif',
            color: "var(--foreground)",
          }}
        >
          {session.participant_count ?? 0}
        </span>
      </td>
      <td className="py-3 pr-4">
        {session.ended_at ? (
          <span className="text-xs text-[var(--muted-foreground)]">
            {formatDate(session.ended_at)}
          </span>
        ) : (
          <span className="text-xs text-[var(--muted-foreground)]">—</span>
        )}
      </td>
      <td className="py-3">
        <StatusBadge status={session.status} />
      </td>
    </tr>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Main AgentDashboard page
// ──────────────────────────────────────────────────────────────────────────────

export default function AgentDashboard() {
  const navigate = useNavigate();

  // ── Route guard: redirect to /login if no JWT ─────────────────────────────
  const token = localStorage.getItem("agent_token");
  useEffect(() => {
    if (!token) {
      navigate("/login", { replace: true });
    }
  }, [token, navigate]);

  // ── State ─────────────────────────────────────────────────────────────────
  const [sessions, setSessions] = useState([]);
  const [fetchError, setFetchError] = useState("");
  const [creatingSession, setCreatingSession] = useState(false);
  const [newSessionError, setNewSessionError] = useState("");
  const [inviteCard, setInviteCard] = useState(null); // { inviteUrl }

  const intervalRef = useRef(null);

  // ── Fetch sessions ────────────────────────────────────────────────────────
  const fetchSessions = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(`${BACKEND_URL}/sessions`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) {
        localStorage.removeItem("agent_token");
        navigate("/login", { replace: true });
        return;
      }
      if (!res.ok) {
        setFetchError("Failed to load sessions.");
        return;
      }
      const data = await res.json();
      // Expect array of sessions (most recent 1000 DESC)
      setSessions(Array.isArray(data) ? data : (data.sessions ?? []));
      setFetchError("");
    } catch {
      setFetchError("Unable to reach the server.");
    }
  }, [token, navigate]);

  // Mount: fetch + set 10-second auto-refresh
  useEffect(() => {
    fetchSessions();
    intervalRef.current = setInterval(fetchSessions, 10_000);
    return () => clearInterval(intervalRef.current);
  }, [fetchSessions]);

  // ── Create new session ────────────────────────────────────────────────────
  async function handleNewSession() {
    if (!token) return;
    setCreatingSession(true);
    setNewSessionError("");
    try {
      const res = await fetch(`${BACKEND_URL}/sessions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });
      if (res.status === 401) {
        localStorage.removeItem("agent_token");
        navigate("/login", { replace: true });
        return;
      }
      if (!res.ok) {
        setNewSessionError("Failed to create session. Please try again.");
        return;
      }
      const { invite_url } = await res.json();
      setInviteCard({ inviteUrl: invite_url });
      // Refresh sessions list immediately
      await fetchSessions();
    } catch {
      setNewSessionError("Unable to reach the server.");
    } finally {
      setCreatingSession(false);
    }
  }

  const handleJoinCall = useCallback((sessionId) => {
    navigate(`/call/${sessionId}`);
  }, [navigate]);

  // ── Split sessions into active vs history ─────────────────────────────────
  const activeSessions = sessions.filter((s) => s.status !== "ended");
  const historySessions = sessions.filter((s) => s.status === "ended");

  // ── Render guard: don't paint anything if there's no token ────────────────
  if (!token) return null;

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ background: "var(--background)", color: "var(--foreground)" }}
    >
      <Header />

      {/* ── Main Content ───────────────────────────────────────────────────── */}
      <main className="flex-1 max-w-6xl mx-auto w-full px-6 py-10">
        {/* Page title row + New Session button */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
          <div>
            <h1
              className="text-4xl font-semibold leading-tight mb-1"
              style={{ fontFamily: '"Playfair Display", serif' }}
            >
              Agent Dashboard
            </h1>
            <p className="text-sm text-[var(--muted-foreground)]">
              Manage support sessions and track history
            </p>
          </div>

          <div className="flex flex-col items-end gap-2">
            <Button
              variant="primary"
              onClick={handleNewSession}
              disabled={creatingSession}
              aria-label="Create a new support session"
            >
              {creatingSession ? "Creating…" : "New Session"}
            </Button>
            {newSessionError && (
              <p
                role="alert"
                aria-live="polite"
                className="text-xs text-red-600"
              >
                {newSessionError}
              </p>
            )}
          </div>
        </div>

        {/* Inline invite URL card */}
        {inviteCard && (
          <InviteCard
            inviteUrl={inviteCard.inviteUrl}
            onDismiss={() => setInviteCard(null)}
          />
        )}

        {/* ── Active Sessions ───────────────────────────────────────────────── */}
        <SectionLabel className="mb-5">Active Sessions</SectionLabel>

        {fetchError && (
          <p
            role="alert"
            aria-live="polite"
            className="text-sm text-red-600 mb-4"
          >
            {fetchError}
          </p>
        )}

        {activeSessions.length === 0 ? (
          <Card className="p-8 text-center mb-10">
            <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
              No active sessions at the moment. Create one using the{" "}
              <strong>New Session</strong> button.
            </p>
          </Card>
        ) : (
          <div
            className="grid gap-3 mb-10"
            style={{
              gridTemplateColumns:
                "repeat(auto-fill, minmax(min(100%, 360px), 1fr))",
            }}
          >
            {activeSessions.map((session) => (
              <SessionCard
                key={session.id}
                session={session}
                onJoin={handleJoinCall}
              />
            ))}
          </div>
        )}

        {/* ── Session History ───────────────────────────────────────────────── */}
        <SectionLabel className="mb-5">Session History</SectionLabel>

        {historySessions.length === 0 ? (
          <Card className="p-8 text-center">
            <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
              No ended sessions yet.
            </p>
          </Card>
        ) : (
          <Card className="overflow-x-auto">
            <table className="w-full text-sm" aria-label="Session history">
              <thead>
                <tr
                  className="border-b"
                  style={{ borderColor: "var(--border)" }}
                >
                  {[
                    "Created",
                    "Session ID",
                    "Participants",
                    "Ended",
                    "Status",
                  ].map((col) => (
                    <th
                      key={col}
                      className="py-3 pr-4 text-left text-xs font-medium uppercase tracking-wider"
                      style={{
                        color: "var(--muted-foreground)",
                        fontFamily: '"IBM Plex Mono", monospace',
                      }}
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {historySessions.map((session, idx) => (
                  <HistoryRow
                    key={session.id}
                    session={session}
                    isLast={idx === historySessions.length - 1}
                  />
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </main>
    </div>
  );
}
