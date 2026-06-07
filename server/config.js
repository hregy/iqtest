import dotenv from "dotenv";
dotenv.config();

export const config = {
  port: Number(process.env.PORT) || 3001,
  databaseUrl:
    process.env.DATABASE_URL ||
    "postgresql://iquser:iqpass@localhost:5432/iqtest",
  // Supabase / managed Postgres needs SSL; local does not.
  pgSsl: (process.env.PGSSL ?? "false").toLowerCase() === "true",
  adminPassword: process.env.ADMIN_PASSWORD || "admin123",
  // Optional bcrypt hash of the admin password (takes precedence over the
  // plaintext above). Generate with: npm run hash-admin -- 'yourPassword'
  adminPasswordHash: process.env.ADMIN_PASSWORD_HASH || "",
  jwtSecret: process.env.JWT_SECRET || "dev-insecure-secret-change-me",
  // The non-expiring master voucher (admin/practice; never recorded).
  adminVoucher: process.env.ADMIN_VOUCHER || "ADMIN-ALL-ACCESS",
  sessionTtlSeconds: 60 * 60, // a test session token is valid for 1 hour
  // Cloudflare Turnstile (bot challenge). Disabled until both are set.
  turnstileSiteKey: process.env.TURNSTILE_SITE_KEY || "",
  turnstileSecret: process.env.TURNSTILE_SECRET || "",
};
