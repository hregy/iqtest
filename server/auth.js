import jwt from "jsonwebtoken";
import { config } from "./config.js";

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

function bearer(req) {
  const h = req.headers.authorization || "";
  return h.startsWith("Bearer ") ? h.slice(7) : null;
}

export function requireAdmin(req, res, next) {
  const claims = verifyToken(bearer(req) || "");
  if (!claims || claims.role !== "admin") {
    return res.status(401).json({ error: "Admin authentication required" });
  }
  next();
}

export function getSession(req) {
  return verifyToken(bearer(req) || "");
}
