/**
 * Property 8: RBAC enforcement
 * Unauthenticated and wrong-role requests are always rejected.
 *
 * Validates: Requirements 4.3, 4.4
 *
 * This test is SELF-CONTAINED: it builds a minimal Express app inline with
 * the real requireRole middleware, mocking only the Supabase client so no
 * real DB connection is required.
 *
 * authenticate is reconstructed inline using the same logic as auth.js so the
 * test secret is resolved at construction time rather than module-load time.
 */

import { describe, it, expect, vi, beforeAll } from "vitest";
import fc from "fast-check";
import request from "supertest";
import express from "express";
import jwt from "jsonwebtoken";

// ─────────────────────────────────────────────────────────────
// Mock Supabase so requireRole's audit_log insert never hits a
// real database. vi.mock is hoisted by vitest before imports.
// ─────────────────────────────────────────────────────────────
vi.mock("../supabase.js", () => {
  const mockInsert = vi.fn().mockResolvedValue({ data: null, error: null });
  const mockFrom = vi.fn(() => ({ insert: mockInsert }));
  return {
    db: { from: mockFrom },
    adminDb: { from: mockFrom },
  };
});

// Import requireRole AFTER mocking supabase
import { requireRole } from "../middleware/requireRole.js";

// ─────────────────────────────────────────────────────────────
// Test secret — used both for signing tokens and for the inline
// authenticate middleware so no env var timing issue occurs.
// ─────────────────────────────────────────────────────────────
const TEST_SECRET = "test-secret-for-rbac-property-tests";

// ─────────────────────────────────────────────────────────────
// Inline authenticate middleware using TEST_SECRET directly.
// Mirrors the exact logic from backend/middleware/auth.js so the
// property test validates the same code path without relying on
// process.env.JWT_SECRET being set before ESM module evaluation.
// ─────────────────────────────────────────────────────────────
function makeAuthenticate(secret) {
  return function authenticate(req, res, next) {
    const authHeader = req.headers["authorization"] ?? "";
    if (authHeader.startsWith("Bearer ")) {
      const token = authHeader.slice(7).trim();
      if (token) {
        try {
          const payload = jwt.verify(token, secret);
          req.user = {
            role: payload.role,
            id: payload.sub,
            sessionId: payload.sessionId ?? null,
          };
          return next();
        } catch {
          return res.status(401).json({
            error: "Invalid or expired token",
            code: "INVALID_TOKEN",
          });
        }
      }
    }

    const inviteToken = req.headers["x-invite-token"];
    if (inviteToken) {
      req.user = {
        role: "customer",
        id: null,
        sessionId: null,
        inviteToken,
      };
      return next();
    }

    return res.status(401).json({
      error: "Authentication required",
      code: "MISSING_AUTH",
    });
  };
}

// ─────────────────────────────────────────────────────────────
// Helper — sign a test JWT using the test secret
// ─────────────────────────────────────────────────────────────
function signToken(payload, opts = {}) {
  return jwt.sign(payload, TEST_SECRET, { expiresIn: "1h", ...opts });
}

// ─────────────────────────────────────────────────────────────
// Agent-only paths used in property generation
// ─────────────────────────────────────────────────────────────
const AGENT_ONLY_PATHS = [
  "/sessions",
  "/sessions/some-id",
  "/sessions/abc-123",
  "/sessions/abc-123/status",
];

// ─────────────────────────────────────────────────────────────
// Build minimal Express app with agent-only routes.
// Uses the real requireRole middleware and the inline authenticate.
// ─────────────────────────────────────────────────────────────
function buildTestApp() {
  const authenticate = makeAuthenticate(TEST_SECRET);
  const app = express();
  app.use(express.json());

  // All routes below require authentication + agent role
  app.use("/sessions", authenticate, requireRole("agent"), (_req, res) => {
    res.status(200).json({ ok: true });
  });

  return app;
}

describe("Property 8: RBAC enforcement", () => {
  let app;

  beforeAll(() => {
    app = buildTestApp();
  });

  // ───────────────────────────────────────────────────────────
  // Property 8a: No Authorization header → always 401
  // ───────────────────────────────────────────────────────────
  it("8a: unauthenticated requests to agent-only routes always return 401", async () => {
    /**
     * **Validates: Requirements 4.3**
     *
     * For any agent-only path, a request with no Authorization header
     * must always be rejected with HTTP 401.
     */
    await fc.assert(
      fc.asyncProperty(fc.constantFrom(...AGENT_ONLY_PATHS), async (path) => {
        const res = await request(app).get(path);
        expect(res.status).toBe(401);
      }),
      { numRuns: AGENT_ONLY_PATHS.length * 5 },
    );
  });

  // ───────────────────────────────────────────────────────────
  // Property 8b: Invalid / malformed Bearer token → always 401
  // ───────────────────────────────────────────────────────────
  it("8b: requests with invalid Bearer tokens to agent-only routes always return 401", async () => {
    /**
     * **Validates: Requirements 4.3**
     *
     * Any syntactically invalid or incorrectly-signed token must be
     * rejected with HTTP 401.
     */
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...AGENT_ONLY_PATHS),
        // Generate plausible-looking but invalid token strings
        fc.oneof(
          fc.constant("not-a-jwt"),
          fc.constant("invalidtoken12345678901234"),
          // A JWT signed with a DIFFERENT secret — valid format, wrong sig
          fc.uuid().map((id) =>
            jwt.sign({ sub: id, role: "agent" }, "wrong-secret", {
              expiresIn: "1h",
            }),
          ),
          fc.base64String({ minLength: 20, maxLength: 64 }),
        ),
        async (path, badToken) => {
          const res = await request(app)
            .get(path)
            .set("Authorization", `Bearer ${badToken}`);
          expect(res.status).toBe(401);
        },
      ),
      { numRuns: 25 },
    );
  });

  // ───────────────────────────────────────────────────────────
  // Property 8c: Customer-role JWT → always 403
  // ───────────────────────────────────────────────────────────
  it("8c: customer-role JWT on agent-only routes always returns 403", async () => {
    /**
     * **Validates: Requirements 4.4**
     *
     * A valid JWT signed with the correct secret but carrying role:'customer'
     * must pass authentication (not 401) but be forbidden by
     * requireRole('agent') (403) on every agent-only route.
     */
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...AGENT_ONLY_PATHS),
        fc.uuid(), // arbitrary customer sub
        async (path, sub) => {
          const token = signToken({ sub, role: "customer" });
          const res = await request(app)
            .get(path)
            .set("Authorization", `Bearer ${token}`);
          expect(res.status).toBe(403);
        },
      ),
      { numRuns: AGENT_ONLY_PATHS.length * 5 },
    );
  });

  // ───────────────────────────────────────────────────────────
  // Property 8d: Agent-role JWT → allowed (sanity / inverse check)
  // ───────────────────────────────────────────────────────────
  it("8d: agent-role JWT on agent-only routes always returns 200 (inverse sanity check)", async () => {
    /**
     * **Validates: Requirements 4.3, 4.4**
     *
     * Confirms the middleware chain accepts a valid agent token so the
     * 401/403 results above are due to auth/role checks and not a broken
     * route registration.
     */
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...AGENT_ONLY_PATHS),
        fc.uuid(),
        async (path, sub) => {
          const token = signToken({ sub, role: "agent" });
          const res = await request(app)
            .get(path)
            .set("Authorization", `Bearer ${token}`);
          expect(res.status).toBe(200);
        },
      ),
      { numRuns: AGENT_ONLY_PATHS.length * 5 },
    );
  });

  // ───────────────────────────────────────────────────────────
  // Property 8e: Expired JWT → always 401 (not 403)
  // ───────────────────────────────────────────────────────────
  it("8e: expired JWT on agent-only routes always returns 401", async () => {
    /**
     * **Validates: Requirements 4.3**
     *
     * An expired token (even with the correct agent role) must be rejected
     * at the authentication layer with HTTP 401, never reaching the role
     * check.
     */
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...AGENT_ONLY_PATHS),
        fc.uuid(),
        fc.constantFrom("agent", "customer"),
        async (path, sub, role) => {
          const token = signToken({ sub, role }, { expiresIn: "-1s" });
          const res = await request(app)
            .get(path)
            .set("Authorization", `Bearer ${token}`);
          expect(res.status).toBe(401);
        },
      ),
      { numRuns: 20 },
    );
  });
});
