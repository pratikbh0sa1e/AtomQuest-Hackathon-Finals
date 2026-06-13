import React from "react";
import { useNavigate, useLocation } from "react-router-dom";

// Helper to decode JWT token
function parseJwt(token) {
  try {
    const base64Url = token.split(".")[1];
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join("")
    );
    return JSON.parse(jsonPayload);
  } catch (e) {
    return null;
  }
}

export default function Header() {
  const navigate = useNavigate();
  const location = useLocation();
  
  const token = localStorage.getItem("agent_token");
  const payload = token ? parseJwt(token) : null;
  const role = payload?.role ?? "";
  
  const isAgent = role === "agent";
  const isAdmin = role === "admin";

  const handleSignOut = () => {
    localStorage.removeItem("agent_token");
    navigate("/login", { replace: true });
  };

  return (
    <header
      className="sticky top-0 z-50 border-b bg-white/95 backdrop-blur-md px-6 py-4"
      style={{
        borderColor: "var(--border)",
      }}
    >
      <div className="max-w-6xl mx-auto flex items-center justify-between gap-4">
        {/* Logo wordmark */}
        <div className="flex items-center gap-3">
          <span
            className="text-2xl font-semibold tracking-tight cursor-pointer"
            style={{
              fontFamily: '"Playfair Display", serif',
              color: "var(--foreground)",
            }}
            onClick={() => navigate(isAdmin ? "/admin" : "/dashboard")}
          >
            AURA<span className="text-[var(--accent)]">.</span>
          </span>
          <span className="font-mono text-[9px] tracking-wider bg-[var(--muted)] px-2 py-0.5 rounded border border-[var(--border)] text-[var(--muted-foreground)] uppercase">
            {role || "Public"}
          </span>
        </div>

        {/* Nav links */}
        {token && (
          <nav className="flex items-center gap-6" aria-label="Primary navigation">
            {isAgent && (
              <a
                onClick={() => navigate("/dashboard")}
                className="text-base font-semibold transition-colors cursor-pointer"
                style={{
                  fontFamily: '"Source Sans 3", system-ui, sans-serif',
                  color: location.pathname === "/dashboard" ? "var(--accent)" : "var(--muted-foreground)",
                }}
              >
                Dashboard
              </a>
            )}
            {isAdmin && (
              <a
                onClick={() => navigate("/admin")}
                className="text-base font-semibold transition-colors cursor-pointer"
                style={{
                  fontFamily: '"Source Sans 3", system-ui, sans-serif',
                  color: location.pathname === "/admin" ? "var(--accent)" : "var(--muted-foreground)",
                }}
              >
                Supervisor Monitor
              </a>
            )}
            <button
              onClick={handleSignOut}
              className="text-base font-semibold hover:text-[var(--accent)] transition-colors bg-transparent border-0 cursor-pointer p-0"
              style={{
                fontFamily: '"Source Sans 3", system-ui, sans-serif',
                color: "var(--muted-foreground)",
              }}
              aria-label="Sign out"
            >
              Sign Out
            </button>
          </nav>
        )}
      </div>
    </header>
  );
}
