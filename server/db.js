import pg from "pg";
import { config } from "./config.js";

export const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  ssl: config.pgSsl ? { rejectUnauthorized: false } : false,
  connectionTimeoutMillis: 10000, // fail fast instead of hanging on a bad host
});

// A pool 'error' on an idle client would otherwise crash the whole process.
pool.on("error", (err) => {
  console.error("Postgres pool error:", err.message);
});

export const query = (text, params) => pool.query(text, params);

export async function withTx(fn) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
