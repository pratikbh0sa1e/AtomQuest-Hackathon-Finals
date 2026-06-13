import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Button, Card, Input, SectionLabel } from "../components/ui/";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:3001";

// Demo accounts shown on the login page
const DEMO_ACCOUNTS = [
  {
    label: "Support Agent",
    username: "demo_agent",
    password: "Demo@1234",
    description: "Create sessions, invite customers, record calls",
    color: "var(--accent)",
  },
  {
    label: "Supervisor",
    username: "supervisor",
    password: "Super@1234",
    description: "Monitor live sessions, force-end calls",
    color: "var(--muted-foreground)",
  },
];

// Client-side validation
function validateForm(username, password) {
  const errors = {};
  if (!username.trim()) {
    errors.username = "Username is required";
  } else if (username.trim().length > 64) {
    errors.username = "Username must be 64 characters or fewer";
  }
  if (!password) {
    errors.password = "Password is required";
  } else if (password.length < 4) {
    errors.password = "Password must be at least 4 characters";
  } else if (password.length > 128) {
    errors.password = "Password too long";
  }
  return errors;
}

export default function AgentLogin() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [serverError, setServerError] = useState("");
  const [loading, setLoading] = useState(false);

  function fillDemo(account) {
    setUsername(account.username);
    setPassword(account.password);
    setFieldErrors({});
    setServerError("");
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setServerError("");

    // Client-side validation first
    const errors = validateForm(username, password);
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }
    setFieldErrors({});
    setLoading(true);

    try {
      const res = await fetch(`${BACKEND_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password }),
      });

      const data = await res.json();

      if (res.status === 400) {
        setServerError(data.error || "Invalid input.");
        return;
      }
      if (res.status === 401) {
        setServerError("Invalid username or password.");
        return;
      }
      if (!res.ok) {
        setServerError("An unexpected error occurred. Please try again.");
        return;
      }

      localStorage.setItem("agent_token", data.token);
      if (data.role === "admin") {
        navigate("/admin");
      } else {
        navigate("/dashboard");
      }
    } catch {
      setServerError(
        "Unable to reach the server. Please check your connection.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4 py-12"
      style={{ background: "var(--background)" }}
    >
      <div className="w-full max-w-sm">
        {/* Back link */}
        <div className="mb-6">
          <Link
            to="/"
            className="text-xs font-mono text-[var(--muted-foreground)] hover:text-[var(--accent)] transition-colors"
          >
            ← Back to home
          </Link>
        </div>

        {/* Headline */}
        <h1
          className="text-4xl font-semibold text-center mb-2"
          style={{
            fontFamily: '"Playfair Display", serif',
            color: "var(--foreground)",
          }}
        >
          Support Portal
        </h1>
        <p className="text-center text-sm text-[var(--muted-foreground)] mb-8">
          Sign in as an agent or supervisor
        </p>

        {/* Demo account quick-fill buttons */}
        <div className="mb-6">
          <p className="text-xs font-mono uppercase tracking-widest text-[var(--muted-foreground)] mb-3 text-center">
            Demo Accounts — click to fill
          </p>
          <div className="grid grid-cols-2 gap-3">
            {DEMO_ACCOUNTS.map((account) => (
              <button
                key={account.username}
                type="button"
                onClick={() => fillDemo(account)}
                className="p-3 rounded-lg border text-left transition-all hover:border-[var(--accent)] hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
                style={{
                  background: "var(--card)",
                  borderColor: "var(--border)",
                }}
              >
                <div
                  className="text-xs font-semibold mb-0.5"
                  style={{
                    color: account.color,
                    fontFamily: '"IBM Plex Mono", monospace',
                  }}
                >
                  {account.label}
                </div>
                <div className="text-[10px] text-[var(--muted-foreground)] leading-tight">
                  {account.description}
                </div>
              </button>
            ))}
          </div>
        </div>

        <SectionLabel className="mb-5">Or sign in manually</SectionLabel>

        {/* Login form */}
        <Card accentTop className="p-6">
          <form onSubmit={handleSubmit} noValidate>
            <div className="flex flex-col gap-4">
              {/* Username */}
              <div>
                <label
                  htmlFor="username"
                  className="block text-sm font-medium mb-1"
                  style={{ color: "var(--foreground)" }}
                >
                  Username
                </label>
                <Input
                  id="username"
                  type="text"
                  autoComplete="username"
                  placeholder="Enter your username"
                  value={username}
                  onChange={(e) => {
                    setUsername(e.target.value);
                    if (fieldErrors.username)
                      setFieldErrors((p) => ({ ...p, username: "" }));
                  }}
                  aria-required="true"
                  aria-invalid={!!fieldErrors.username}
                  aria-describedby={
                    fieldErrors.username ? "username-error" : undefined
                  }
                />
                {fieldErrors.username && (
                  <p
                    id="username-error"
                    className="text-xs text-red-600 mt-1"
                    role="alert"
                  >
                    {fieldErrors.username}
                  </p>
                )}
              </div>

              {/* Password */}
              <div>
                <label
                  htmlFor="password"
                  className="block text-sm font-medium mb-1"
                  style={{ color: "var(--foreground)" }}
                >
                  Password
                </label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (fieldErrors.password)
                      setFieldErrors((p) => ({ ...p, password: "" }));
                  }}
                  aria-required="true"
                  aria-invalid={!!fieldErrors.password}
                  aria-describedby={
                    fieldErrors.password ? "password-error" : undefined
                  }
                />
                {fieldErrors.password && (
                  <p
                    id="password-error"
                    className="text-xs text-red-600 mt-1"
                    role="alert"
                  >
                    {fieldErrors.password}
                  </p>
                )}
              </div>

              {/* Server error */}
              {serverError && (
                <p
                  role="alert"
                  className="text-sm text-red-600"
                  aria-live="polite"
                >
                  {serverError}
                </p>
              )}

              <Button
                type="submit"
                variant="primary"
                disabled={loading}
                className="w-full mt-1"
              >
                {loading ? "Signing in…" : "Sign In"}
              </Button>
            </div>
          </form>
        </Card>

        {/* Credentials hint */}
        <div className="mt-4 p-3 rounded-lg border border-dashed border-[var(--border)] text-center">
          <p className="text-[10px] font-mono text-[var(--muted-foreground)]">
            AGENT: demo_agent / Demo@1234 &nbsp;|&nbsp; SUPERVISOR: supervisor /
            Super@1234
          </p>
        </div>
      </div>
    </div>
  );
}
