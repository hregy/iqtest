import express from "express";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { config } from "./config.js";
import { publicRouter } from "./routes/public.js";
import { adminRouter } from "./routes/admin.js";
import { initDb } from "./seed.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(__dirname, "..", "dist");

const app = express();
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (_req, res) => res.json({ ok: true }));
app.use("/api", publicRouter);
app.use("/api/admin", adminRouter);

// Serve the built SPA (production). In dev the Vite server proxies /api here.
if (fs.existsSync(DIST)) {
  app.use(express.static(DIST));
  // SPA fallback (Express 5: avoid string wildcard routes, use middleware)
  app.use((req, res, next) => {
    if (req.method !== "GET" || req.path.startsWith("/api/")) return next();
    res.sendFile(path.join(DIST, "index.html"));
  });
}

async function startServer() {
  try {
    await initDb({ seedIfEmpty: true });
    console.log("Database ready.");
  } catch (e) {
    console.error("DB init failed (continuing — check DATABASE_URL):", e.message);
  }

  // SOCKET_PATH lets us listen on a Unix domain socket (sandboxed local
  // testing); otherwise listen on the configured TCP port.
  if (process.env.SOCKET_PATH) {
    try { fs.unlinkSync(process.env.SOCKET_PATH); } catch { /* ignore */ }
    app.listen(process.env.SOCKET_PATH, () =>
      console.log(`IQ test server listening on unix:${process.env.SOCKET_PATH}`)
    );
  } else {
    app.listen(config.port, () => console.log(`IQ test server listening on :${config.port}`));
  }
}

startServer();
