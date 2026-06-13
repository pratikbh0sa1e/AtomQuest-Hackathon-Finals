import React, { useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { Button, Card, Input, SectionLabel } from "../components/ui/";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:3001";

function decodeJwtPayload(token) {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(base64));
  } catch {
    return null;
  }
}

// Client-side validation
function validateName(name) {
  if (!name.trim()) return "Your name is required";
  if (name.trim().length < 2) return "Name must be at least 2 characters";
  if (name.trim().length > 64) return "Name must be 64 characters or fewer";
  if (!/^[\p{L}\p{N} '_\-\.]+$/u.test(name.trim()))
    return "Name contains invalid characters";
  return null;
}

export default function CustomerJoin() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [customerName, setCustomerName] = useState("");
  const [nameError, setNameError] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null); // { type: '410'|'404'|'400'|'generic', message }

  const inviteToken = searchParams.get("token");

  // Show a clear error if there's no token in URL at all
  const missingToken = !inviteToken;

  async function handleJoin(e) {
    e.preventDefault();
    setError(null);

    // Client-side name validation
    const nameErr = validateName(customerName);
    if (nameErr) {
      setNameError(nameErr);
      return;
    }
    setNameError("");
    setLoading(true);

    try {
      const res = await fetch(
        `${BACKEND_URL}/auth/join?invite_token=${encodeURIComponent(inviteToken || "")}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: customerName.trim() }),
        },
      );

      const data = await res.json().catch(() => ({}));

      if (res.status === 410) {
        setError({ type: "410", message: "This invite link has expired." });
        return;
      }
      if (res.status === 404) {
        setError({ type: "404", message: "Invalid or already used link." });
        return;
      }
      if (res.status === 400) {
        setError({ type: "400", message: data.error || "Invalid request." });
        return;
      }
      if (!res.ok) {
        setError({
          type: "generic",
          message: "Something went wrong. Please try again.",
        });
        return;
      }

      const { token: customerToken } = data;
      sessionStorage.setItem("customer_token", customerToken);

      const payload = decodeJwtPayload(customerToken);
      const sessionId = payload?.sessionId;

      if (!sessionId) {
        setError({
          type: "generic",
          message: "Unable to determine session. Please try again.",
        });
        return;
      }

      navigate(`/call/${sessionId}`);
    } catch {
      setError({
        type: "generic",
        message: "Unable to reach the server. Please check your connection.",
      });
    } finally {
      setLoading(false);
    }
  }

  // ── No token in URL ───────────────────────────────────────────────────────
  if (missingToken) {
    return (
      <div
        className="min-h-screen flex items-center justify-center px-4"
        style={{ background: "var(--background)" }}
      >
        <div className="w-full max-w-lg text-center">
          <h1
            className="text-4xl font-semibold mb-6"
            style={{ fontFamily: '"Playfair Display", serif' }}
          >
            Join Support Session
          </h1>
          <Card accentTop className="p-8">
            <p className="text-2xl mb-3">🔗</p>
            <p className="font-medium text-[var(--foreground)] mb-2">
              No invite link detected
            </p>
            <p className="text-sm text-[var(--muted-foreground)]">
              Please use the invite link sent to you by your support agent. It
              looks like:{" "}
              <code className="font-mono text-xs bg-[var(--muted)] px-1 py-0.5 rounded">
                /join?token=...
              </code>
            </p>
          </Card>
          <Link
            to="/"
            className="mt-6 inline-block text-xs font-mono text-[var(--muted-foreground)] hover:text-[var(--accent)] transition-colors"
          >
            ← Back to home
          </Link>
        </div>
      </div>
    );
  }

  // ── Token error states (expired / used) ───────────────────────────────────
  if (error && (error.type === "410" || error.type === "404")) {
    return (
      <div
        className="min-h-screen flex items-center justify-center px-4"
        style={{ background: "var(--background)" }}
      >
        <div className="w-full max-w-lg text-center">
          <h1
            className="text-4xl font-semibold mb-6"
            style={{ fontFamily: '"Playfair Display", serif' }}
          >
            Join Support Session
          </h1>
          <Card
            accentTop
            className="p-8"
            style={{ borderColor: "var(--accent)" }}
          >
            <p className="text-2xl mb-3">
              {error.type === "410" ? "⏰" : "🚫"}
            </p>
            <p
              className="font-semibold text-[var(--foreground)] mb-2"
              role="alert"
            >
              {error.message}
            </p>
            <p className="text-sm text-[var(--muted-foreground)]">
              {error.type === "410"
                ? "Support session links expire after 24 hours. Please request a new link from your support agent."
                : "This link may have already been used or is invalid. Please request a new link from your support agent."}
            </p>
          </Card>
          <Link
            to="/"
            className="mt-6 inline-block text-xs font-mono text-[var(--muted-foreground)] hover:text-[var(--accent)] transition-colors"
          >
            ← Back to home
          </Link>
        </div>
      </div>
    );
  }

  // ── Main join form ────────────────────────────────────────────────────────
  return (
    <div
      className="min-h-screen flex items-center justify-center px-4 py-12"
      style={{ background: "var(--background)" }}
    >
      <div className="w-full max-w-lg">
        <div className="mb-6">
          <Link
            to="/"
            className="text-xs font-mono text-[var(--muted-foreground)] hover:text-[var(--accent)] transition-colors"
          >
            ← Back to home
          </Link>
        </div>

        <h1
          className="text-4xl font-semibold text-center mb-2"
          style={{
            fontFamily: '"Playfair Display", serif',
            color: "var(--foreground)",
          }}
        >
          Join Support Session
        </h1>
        <p className="text-center text-sm text-[var(--muted-foreground)] mb-8">
          You've been invited to a live video support call
        </p>

        {/* Token display */}
        <div className="mb-6 p-3 rounded-lg border border-[var(--border)] bg-[var(--muted)] text-center">
          <p className="text-[10px] font-mono text-[var(--muted-foreground)] uppercase tracking-widest mb-1">
            Invite Token
          </p>
          <code className="text-xs font-mono text-[var(--accent)] break-all">
            {inviteToken}
          </code>
        </div>

        <SectionLabel className="mb-5">Enter your name to join</SectionLabel>

        <Card accentTop className="p-6">
          <form onSubmit={handleJoin} noValidate>
            <div className="flex flex-col gap-4">
              <div>
                <label
                  htmlFor="customer-name"
                  className="block text-sm font-medium mb-1"
                  style={{ color: "var(--foreground)" }}
                >
                  Your name
                </label>
                <Input
                  id="customer-name"
                  type="text"
                  autoComplete="name"
                  placeholder="e.g. John Smith"
                  value={customerName}
                  onChange={(e) => {
                    setCustomerName(e.target.value);
                    if (nameError) setNameError("");
                  }}
                  aria-required="true"
                  aria-invalid={!!nameError}
                  aria-describedby={nameError ? "name-error" : undefined}
                  maxLength={64}
                />
                {nameError && (
                  <p
                    id="name-error"
                    className="text-xs text-red-600 mt-1"
                    role="alert"
                  >
                    {nameError}
                  </p>
                )}
                <p className="text-[10px] text-[var(--muted-foreground)] mt-1 font-mono">
                  {customerName.trim().length}/64 characters
                </p>
              </div>

              {/* Generic / 400 error */}
              {error && (error.type === "generic" || error.type === "400") && (
                <p
                  role="alert"
                  className="text-sm text-red-600"
                  aria-live="polite"
                >
                  {error.message}
                </p>
              )}

              <Button
                type="submit"
                variant="primary"
                disabled={loading || !customerName.trim()}
                className="w-full mt-1"
              >
                {loading ? "Joining…" : "Join Call"}
              </Button>

              <p className="text-[10px] text-center text-[var(--muted-foreground)]">
                No account needed. Your name is only used to identify you in the
                call.
              </p>
            </div>
          </form>
        </Card>
      </div>
    </div>
  );
}
