import express from "express";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { config } from "./config.js";
import { publicRouter } from "./routes/public.js";
import { adminRouter } from "./routes/admin.js";
import { initDb } from "./seed.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(__dirname, "..", "dist");
const CF = "https://challenges.cloudflare.com"; // Turnstile

const app = express();
app.set("trust proxy", 1); // behind Render's proxy — get real client IP for rate limiting

// Security headers + Content-Security-Policy (allow only our origin + Turnstile
// + Google Fonts). Also neutralises inline scripts inside served SVGs.
app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", CF],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:"],
        connectSrc: ["'self'", CF],
        frameSrc: [CF],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'self'"],
        upgradeInsecureRequests: [],
      },
    },
    crossOriginEmbedderPolicy: false, // don't break Turnstile / fonts
  })
);

app.use(cookieParser());
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

function startServer() {
  // Listen FIRST so the server is always up (health/login work even if the
  // DB is misconfigured); initialise the DB in the background.
  if (process.env.SOCKET_PATH) {
    try { fs.unlinkSync(process.env.SOCKET_PATH); } catch { /* ignore */ }
    app.listen(process.env.SOCKET_PATH, () =>
      console.log(`IQ test server listening on unix:${process.env.SOCKET_PATH}`)
    );
  } else {
    app.listen(config.port, () => console.log(`IQ test server listening on :${config.port}`));
  }

  initDb({ seedIfEmpty: true })
    .then(() => console.log("Database ready."))
    .catch((e) => console.error("DB init failed (check DATABASE_URL/PGSSL):", e.message));
}

// Never let an unexpected async error take the whole process down.
process.on("unhandledRejection", (e) => console.error("unhandledRejection:", e));

startServer();
