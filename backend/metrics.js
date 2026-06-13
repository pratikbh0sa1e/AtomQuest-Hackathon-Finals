import client from "prom-client";

const { Registry, Gauge, Counter, collectDefaultMetrics } = client;

// Create a dedicated registry for this application
export const register = new Registry();

// Optionally collect default Node.js process metrics (memory, CPU, event loop, etc.)
collectDefaultMetrics({ register });

/**
 * Gauge: current number of sessions with status 'active'.
 * Updated at scrape time by querying the database.
 * Validates: Requirements 9.2
 */
export const activeSessionsGauge = new Gauge({
  name: "active_sessions_total",
  help: "Number of sessions with status active",
  registers: [register],
});

/**
 * Counter: total errors, partitioned by error_type label.
 * Valid label values: client_error (4xx), server_error (5xx),
 * internal_error (unhandled exceptions that produce no HTTP response).
 * Validates: Requirements 9.3
 */
export const errorCounter = new Counter({
  name: "errors_total",
  help: "Total errors by type (client_error, server_error, internal_error)",
  labelNames: ["error_type"],
  registers: [register],
});

/** Allowed error type labels (R9.3) */
const VALID_ERROR_TYPES = new Set([
  "client_error",
  "server_error",
  "internal_error",
]);

/**
 * Increment the errors_total counter for a given error type.
 * Validates the type before incrementing — throws if an invalid type is supplied
 * so callers cannot accidentally create out-of-spec label values.
 *
 * @param {'client_error'|'server_error'|'internal_error'} type
 */
export function incrementError(type) {
  if (!VALID_ERROR_TYPES.has(type)) {
    throw new Error(
      `Invalid error_type "${type}". Must be one of: ${[...VALID_ERROR_TYPES].join(", ")}`,
    );
  }
  errorCounter.inc({ error_type: type });
}
