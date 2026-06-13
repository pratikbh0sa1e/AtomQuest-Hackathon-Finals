import { Router } from "express";
import { register, activeSessionsGauge } from "../metrics.js";
import { db } from "../supabase.js";

const metricsRouter = Router();

/**
 * GET /metrics
 * Returns Prometheus text exposition format (version 0.0.4).
 *
 * Auth: unless METRICS_AUTH_DISABLED=true, requires
 *   Authorization: Bearer <METRICS_API_KEY>
 *
 * Validates: Requirements 9.1, 9.2, 9.4, 9.5
 */
metricsRouter.get("/", async (req, res) => {
  // Requirement 9.4 / 9.5: bearer token validation, skipped when METRICS_AUTH_DISABLED=true
  if (process.env.METRICS_AUTH_DISABLED !== "true") {
    const authHeader = req.headers["authorization"] ?? "";
    const token = authHeader.startsWith("Bearer ")
      ? authHeader.slice("Bearer ".length)
      : null;

    if (!token || token !== process.env.METRICS_API_KEY) {
      return res.status(401).json({ error: "Unauthorized" });
    }
  }

  try {
    // Requirement 9.2: query active sessions count and update gauge before scrape.
    // Using count: 'exact' with head: true so Supabase returns the count
    // directly without fetching rows. The count is on the response object itself.
    const { count, error } = await db
      .from("sessions")
      .select("*", { count: "exact", head: true })
      .eq("status", "active");

    if (error) {
      console.error(
        "[metrics] Failed to query active sessions:",
        error.message,
      );
    } else {
      activeSessionsGauge.set(count ?? 0);
    }
  } catch (err) {
    console.error("[metrics] Unexpected error querying active sessions:", err);
  }

  // Requirement 9.1: return metrics in Prometheus text format v0.0.4
  const metrics = await register.metrics();
  res.set("Content-Type", "text/plain; version=0.0.4");
  res.send(metrics);
});

export default metricsRouter;
