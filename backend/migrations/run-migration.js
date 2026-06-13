import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import "dotenv/config";
import { adminDb } from "../supabase.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const SQL_FILE = join(__dirname, "001_initial_schema.sql");

async function runMigration() {
  console.log("Reading migration file:", SQL_FILE);
  const sql = readFileSync(SQL_FILE, "utf8");

  console.log("Running migration against Supabase...");

  let error;
  try {
    const res = await adminDb.rpc("exec_sql", { query: sql });
    error = res.error;
  } catch (err) {
    error = { message: err.message || "exec_sql RPC not available, trying alternative" };
  }

  if (error) {
    // Fallback: execute via the Postgres REST extension if exec_sql is unavailable.
    // Supabase exposes a /rest/v1/rpc/exec_sql endpoint when the pg_net extension
    // is enabled; otherwise use the raw SQL endpoint via the service-role key.
    console.warn(
      "exec_sql RPC unavailable, attempting raw SQL via adminDb.schema...",
    );

    // Split on statement-terminating semicolons (skip empty chunks)
    const statements = sql
      .split(";")
      .map((s) => s.trim())
      .filter(Boolean);

    let failed = 0;
    for (const stmt of statements) {
      let stmtError;
      try {
        const stmtRes = await adminDb.rpc("exec_sql", { query: stmt + ";" });
        stmtError = stmtRes.error;
      } catch (err) {
        stmtError = err;
      }

      if (stmtError) {
        // Many environments expose the SQL API at /rest/v1/query — try that path
        const res = await fetch(`${process.env.SUPABASE_URL}/rest/v1/query`, {
          method: "POST",
          headers: {
            apikey: process.env.SUPABASE_SERVICE_KEY,
            Authorization: `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ query: stmt + ";" }),
        }).catch(() => null);

        if (!res || !res.ok) {
          console.error(`Statement failed:\n${stmt}\n`);
          failed++;
        }
      }
    }

    if (failed > 0) {
      console.error(`Migration completed with ${failed} failed statement(s).`);
      console.error(
        "If the tables already exist this is expected (IF NOT EXISTS guards should prevent errors).",
      );
      console.error(
        "For a fresh Supabase project, run this SQL directly in the Supabase SQL Editor:",
      );
      console.error(SQL_FILE);
      process.exit(1);
    }
  }

  console.log("Migration completed successfully.");
}

runMigration().catch((err) => {
  console.error("Unexpected error running migration:", err);
  process.exit(1);
});
