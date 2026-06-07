import crypto from "crypto";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { config } from "./config.js";

const COOKIE = "admin_token";

export function signAdmin() {
  return jwt.sign({ role: "admin" }, config.jwtSecret, { expiresIn: "12h" });
}

export function signSession(payload) {
  return jwt.sign(payload, config.jwtSecret, { expiresIn: config.sessionTtlSeconds });
}

export function verifyToken(token) {
  try {
    return jwt.verify(token, config.jwtSecret);
  } catch {
    return null;
  }
}

// Verify the admin password against a bcrypt hash if configured, else a
// constant-time comparison with the plaintext env value.
export function checkAdminPassword(pw) {
  if (!pw) return false;
  if (config.adminPasswordHash) {
    try { return bcrypt.compareSync(pw, config.adminPasswordHash); } catch { return false; }
  }
  const a = Buffer.from(pw);
  const b = Buffer.from(config.adminPassword || "");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function setAdminCookie(req, res) {
  const secure = req.secure || req.headers["x-forwarded-proto"] === "https";
  res.cookie(COOKIE, signAdmin(), {
    httpOnly: true,
    sameSite: "strict",
    secure,
    maxAge: 12 * 60 * 60 * 1000,
    path: "/",
  });
}

export function clearAdminCookie(res) {
  res.clearCookie(COOKIE, { path: "/" });
}

function bearer(req) {
  const h = req.headers.authorization || "";
  return h.startsWith("Bearer ") ? h.slice(7) : null;
}

// Admin token comes from the httpOnly cookie (preferred) or a Bearer header.
export function requireAdmin(req, res, next) {
  const token = req.cookies?.[COOKIE] || bearer(req) || "";
  const claims = verifyToken(token);
  if (!claims || claims.role !== "admin") {
    return res.status(401).json({ error: "Admin authentication required" });
  }
  next();
}

export function getSession(req) {
  return verifyToken(bearer(req) || "");
}
