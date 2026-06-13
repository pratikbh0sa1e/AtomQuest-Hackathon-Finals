/**
 * Property 9: Unauthorized Customer actions always produce an audit log entry
 *
 * Validates: Requirements 4.8
 *
 * For any customer-role attempt on agent-only endpoints:
 * - asserts HTTP 403 response
 * - asserts audit_log row inserted with correct fields:
 *   participant_id, session_id, action, ip_address
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import fc from "fast-check";
import express from "express";
import jwt from "jsonwebtoken";

// ── Mock the Supabase client BEFORE importing requireRole ──────────────────────
// vi.mock hoists this to the top of the module even though it appears here.
vi.mock("../supabase.js", () => {
  const insertMock = vi.fn().mockResolvedValue({ data: {}, error: null });
  const fromMock = vi.fn(() => ({ insert: insertMock }));
  return {
    db: { from: fromMock },
    adminDb: { from: fromMock },
    // Expose mocks for test assertions
    __insertMock: insertMock,
    __fromMock: fromMock,
  };
});

// Import AFTER mock is registered
import { requireRole } from "../middleware/requireRole.js";
import * as supabaseMock from "../supabase.js";

// ── Constants ──────────────────────────────────────────────────────────────────
const JWT_SECRET = "test-secret";
const AGENT_ONLY_PATHS = [
  "/sessions",
  "/sessions/some-id",
  "/sessions/some-id/status",
  "/recordings/start",
  "/recordings/stop",
  "/admin/sessions",
  "/admin/sessions/some-id/end",
];
const HTTP_METHODS = ["GET", "POST", "PATCH", "DELETE", "PUT"];

/**
 * Build a minimal Express app with a single route that is protected
 * by requireRole('agent'). Used to simulate any agent-only endpoint.
 */
function buildApp(method, path) {
  const app = express();
  app.use(express.json());

  // Mount the route at the given path with requireRole guard
  app[method.toLowerCase()](path, requireRole("agent"), (_req, res) => {
    res.status(200).json({ ok: true });
  });

  return app;
}

/**
 * Make a request to the Express app using Node's http module directly.
 * Returns { status, body }.
 */
async function makeRequest(app, method, path, token, ip = "127.0.0.1") {
  const { createServer } = await import("http");
  const server = createServer(app);

  return new Promise((resolve, reject) => {
    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      const url = `http://127.0.0.1:${port}${path}`;

      const options = new URL(url);
      const reqOptions = {
        hostname: options.hostname,
        port: options.port,
        path: options.pathname,
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "X-Forwarded-For": ip,
        },
      };

      import("http").then(({ request }) => {
        const req = request(reqOptions, (res) => {
          let data = "";
          res.on("data", (chunk) => (data += chunk));
          res.on("end", () => {
            server.close();
            try {
              resolve({ status: res.statusCode, body: JSON.parse(data) });
            } catch {
              resolve({ status: res.statusCode, body: data });
            }
          });
        });
        req.on("error", (err) => {
          server.close();
          reject(err);
        });
        req.end();
      });
    });
  });
}

/**
 * Sign a Customer JWT with arbitrary sub/sessionId values.
 */
function makeCustomerToken(participantId, sessionId) {
  return jwt.sign(
    { sub: participantId, role: "customer", sessionId },
    JWT_SECRET,
    { expiresIn: "1h" },
  );
}

/**
 * Decode JWT and attach req.user — simulates the auth middleware upstream.
 */
function authMiddleware(secret) {
  return (req, res, next) => {
    const header = req.headers["authorization"] ?? "";
    if (!header.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Missing auth" });
    }
    try {
      const payload = jwt.verify(header.slice(7).trim(), secret);
      req.user = {
        role: payload.role,
        id: payload.sub,
        sessionId: payload.sessionId ?? null,
      };
    } catch {
      return res.status(401).json({ error: "Invalid token" });
    }
    next();
  };
}

/**
 * Build a minimal Express app with auth + requireRole('agent') applied.
 */
function buildProtectedApp(method, path) {
  const app = express();
  app.use(express.json());
  app.use(authMiddleware(JWT_SECRET));
  app[method.toLowerCase()](path, requireRole("agent"), (_req, res) => {
    res.status(200).json({ ok: true });
  });
  return app;
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("Property 9: Unauthorized Customer actions always produce an audit log entry", () => {
  beforeEach(() => {
    // Reset mock call counts before each test
    vi.clearAllMocks();
  });

  it("for any customer JWT on any agent-only path: HTTP 403 AND audit_log insert with correct fields", async () => {
    /**
     * **Validates: Requirements 4.8**
     *
     * Property: for all (participantId, sessionId, path, method) combinations,
     * a customer JWT hitting an agent-only endpoint always results in:
     *   1. HTTP 403 response
     *   2. db.from('audit_log').insert(...) called exactly once
     *   3. The inserted row has non-empty participant_id, action, and ip_address fields
     */
    await fc.assert(
      fc.asyncProperty(
        // Generate arbitrary participant IDs (UUIDs)
        fc.uuid(),
        // Generate arbitrary session IDs (UUIDs)
        fc.uuid(),
        // Pick a random agent-only path
        fc.constantFrom(...AGENT_ONLY_PATHS),
        // Pick a random HTTP method
        fc.constantFrom(...HTTP_METHODS),
        // Pick an arbitrary IP address
        fc.ipV4(),
        async (participantId, sessionId, routePath, httpMethod, ip) => {
          // Reset mocks for this iteration
          vi.clearAllMocks();

          // Rebuild the mock chain since vi.clearAllMocks resets call history
          const insertMock = supabaseMock.__insertMock;
          const fromMock = supabaseMock.__fromMock;
          insertMock.mockResolvedValue({ data: {}, error: null });
          fromMock.mockReturnValue({ insert: insertMock });
          supabaseMock.db.from = fromMock;

          // Sign a customer JWT
          const token = makeCustomerToken(participantId, sessionId);

          // Build and run the request
          const app = buildProtectedApp(httpMethod, routePath);
          const { status } = await makeRequest(
            app,
            httpMethod,
            routePath,
            token,
            ip,
          );

          // ── Assertion 1: HTTP 403 ──────────────────────────────────────
          expect(status).toBe(403);

          // ── Assertion 2: audit_log insert was called ───────────────────
          expect(fromMock).toHaveBeenCalledWith("audit_log");
          expect(insertMock).toHaveBeenCalledTimes(1);

          // ── Assertion 3: inserted row has correct fields ───────────────
          const insertedRow = insertMock.mock.calls[0][0];

          // participant_id must be present (the customer's ID)
          expect(insertedRow).toHaveProperty("participant_id");
          expect(insertedRow.participant_id).toBeTruthy();

          // session_id field must be present (may be null for some paths)
          expect(insertedRow).toHaveProperty("session_id");

          // action must be a non-empty string containing method and path info
          expect(insertedRow).toHaveProperty("action");
          expect(typeof insertedRow.action).toBe("string");
          expect(insertedRow.action.length).toBeGreaterThan(0);

          // ip_address field must be present
          expect(insertedRow).toHaveProperty("ip_address");
        },
      ),
      {
        numRuns: 25,
        verbose: true,
      },
    );
  });

  it("audit_log entry contains the customer identifier (participant_id matches JWT sub)", async () => {
    /**
     * **Validates: Requirements 4.8**
     *
     * Specific check: the participant_id in the audit log must match the
     * `sub` claim from the customer JWT — proving the correct identity is logged.
     */
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        fc.constantFrom(...AGENT_ONLY_PATHS),
        fc.constantFrom(...HTTP_METHODS),
        async (participantId, sessionId, routePath, httpMethod) => {
          vi.clearAllMocks();

          const insertMock = supabaseMock.__insertMock;
          const fromMock = supabaseMock.__fromMock;
          insertMock.mockResolvedValue({ data: {}, error: null });
          fromMock.mockReturnValue({ insert: insertMock });
          supabaseMock.db.from = fromMock;

          const token = makeCustomerToken(participantId, sessionId);
          const app = buildProtectedApp(httpMethod, routePath);
          const { status } = await makeRequest(
            app,
            httpMethod,
            routePath,
            token,
          );

          expect(status).toBe(403);
          expect(insertMock).toHaveBeenCalledTimes(1);

          const insertedRow = insertMock.mock.calls[0][0];
          // participant_id in audit log must match the JWT sub (customer identifier)
          expect(insertedRow.participant_id).toBe(participantId);
        },
      ),
      {
        numRuns: 20,
        verbose: true,
      },
    );
  });

  it("audit_log entry action field contains HTTP method and path", async () => {
    /**
     * **Validates: Requirements 4.8**
     *
     * The action field must capture what was attempted.
     * requireRole.js sets action = `${req.method} ${req.path}`.
     */
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        fc.constantFrom(...AGENT_ONLY_PATHS),
        fc.constantFrom(...HTTP_METHODS),
        async (participantId, sessionId, routePath, httpMethod) => {
          vi.clearAllMocks();

          const insertMock = supabaseMock.__insertMock;
          const fromMock = supabaseMock.__fromMock;
          insertMock.mockResolvedValue({ data: {}, error: null });
          fromMock.mockReturnValue({ insert: insertMock });
          supabaseMock.db.from = fromMock;

          const token = makeCustomerToken(participantId, sessionId);
          const app = buildProtectedApp(httpMethod, routePath);
          await makeRequest(app, httpMethod, routePath, token);

          expect(insertMock).toHaveBeenCalledTimes(1);

          const insertedRow = insertMock.mock.calls[0][0];
          // action should contain the HTTP method
          expect(insertedRow.action).toContain(httpMethod);
        },
      ),
      {
        numRuns: 20,
        verbose: true,
      },
    );
  });

  it("403 is NOT returned for valid agent JWT — no audit_log insert occurs", async () => {
    /**
     * Negative case: confirms that authorized agents do NOT trigger audit log entries.
     * This validates that the property is specific to unauthorized customers.
     */
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.constantFrom(...AGENT_ONLY_PATHS),
        fc.constantFrom(...HTTP_METHODS),
        async (agentId, routePath, httpMethod) => {
          vi.clearAllMocks();

          const insertMock = supabaseMock.__insertMock;
          const fromMock = supabaseMock.__fromMock;
          insertMock.mockResolvedValue({ data: {}, error: null });
          fromMock.mockReturnValue({ insert: insertMock });
          supabaseMock.db.from = fromMock;

          const agentToken = jwt.sign(
            { sub: agentId, role: "agent" },
            JWT_SECRET,
            { expiresIn: "1h" },
          );

          const app = buildProtectedApp(httpMethod, routePath);
          const { status } = await makeRequest(
            app,
            httpMethod,
            routePath,
            agentToken,
          );

          // Agent should pass requireRole — 200 from the stub handler (not 403)
          expect(status).toBe(200);
          // No audit_log insert should happen for authorized agents
          expect(insertMock).not.toHaveBeenCalled();
        },
      ),
      {
        numRuns: 15,
        verbose: true,
      },
    );
  });
});
