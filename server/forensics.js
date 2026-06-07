// Collect forensic info about who/what is taking a test: client IP, IP-geo
// (country/city/ISP + VPN/datacenter flags via ip-api.com), parsed User-Agent,
// bot/automation flags, and Cloudflare Turnstile verification.
import { UAParser } from "ua-parser-js";
import { config } from "./config.js";

export function getClientIp(req) {
  const xff = (req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return xff || req.ip || req.socket?.remoteAddress || "";
}

function isPrivateIp(ip) {
  return (
    !ip ||
    ip === "::1" ||
    ip.startsWith("127.") ||
    ip.startsWith("10.") ||
    ip.startsWith("192.168.") ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(ip) ||
    ip.startsWith("fc") ||
    ip.startsWith("fd")
  );
}

const geoCache = new Map(); // ip -> { at, data }
const GEO_TTL = 6 * 60 * 60 * 1000;

export async function geoLookup(ip) {
  if (isPrivateIp(ip)) return { country: null, region: null, city: null, isp: null, proxy: false, hosting: false, mobile: false, private: true };
  const cached = geoCache.get(ip);
  if (cached && Date.now() - cached.at < GEO_TTL) return cached.data;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 3000);
  try {
    const fields = "status,country,countryCode,regionName,city,isp,org,as,proxy,hosting,mobile,query";
    const r = await fetch(`http://ip-api.com/json/${encodeURIComponent(ip)}?fields=${fields}`, { signal: ctrl.signal });
    const j = await r.json();
    const data = j.status === "success"
      ? { country: j.country, countryCode: j.countryCode, region: j.regionName, city: j.city,
          isp: j.isp || j.org || j.as, proxy: !!j.proxy, hosting: !!j.hosting, mobile: !!j.mobile }
      : { country: null, region: null, city: null, isp: null, proxy: false, hosting: false, mobile: false };
    geoCache.set(ip, { at: Date.now(), data });
    return data;
  } catch {
    return { country: null, region: null, city: null, isp: null, proxy: false, hosting: false, mobile: false, error: true };
  } finally {
    clearTimeout(timer);
  }
}

export function parseUa(ua) {
  try {
    const p = new UAParser(ua || "").getResult();
    const browser = [p.browser.name, p.browser.version].filter(Boolean).join(" ");
    const os = [p.os.name, p.os.version].filter(Boolean).join(" ");
    const device = p.device.type || (/mobile/i.test(ua) ? "mobile" : "desktop");
    return { browser: browser || null, os: os || null, device };
  } catch {
    return { browser: null, os: null, device: null };
  }
}

// Combine client + server signals into bot/automation flags.
export function computeBotFlags(client, geo, ua) {
  const reasons = [];
  const c = client || {};
  if (c.webdriver) reasons.push("automation (navigator.webdriver)");
  if (/headless|phantom|electron|puppeteer|playwright|selenium/i.test(ua || "")) reasons.push("headless/automation user-agent");
  if (Array.isArray(c.languages) && c.languages.length === 0) reasons.push("no browser languages");
  if (c.screen && (!c.screen.w || !c.screen.h)) reasons.push("no screen dimensions");
  if (geo?.hosting) reasons.push("datacenter / hosting IP");
  if (geo?.proxy) reasons.push("proxy / VPN");
  return {
    webdriver: !!c.webdriver,
    datacenter: !!geo?.hosting,
    proxy: !!geo?.proxy,
    reasons,
    suspectedBot: reasons.some((r) => /automation|headless|no screen|no browser/.test(r)),
  };
}

// Verify a Cloudflare Turnstile token. If no secret is configured, the gate is
// disabled and we return ok=true (so the app works before keys are added).
export async function verifyTurnstile(token, ip) {
  if (!config.turnstileSecret) return { ok: true, disabled: true };
  if (!token) return { ok: false };
  try {
    const body = new URLSearchParams({ secret: config.turnstileSecret, response: token });
    if (ip) body.set("remoteip", ip);
    const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body });
    const j = await r.json();
    return { ok: !!j.success };
  } catch {
    return { ok: false, error: true };
  }
}
