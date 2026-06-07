// Tiny in-memory fixed-window rate limiter (no external dependency).
// Fine for a single-instance Render service.
export function rateLimit({ windowMs, max, name = "rl" }) {
  const hits = new Map(); // key -> { count, resetAt }
  return (req, res, next) => {
    const now = Date.now();
    const key = `${name}:${req.ip}`;
    let h = hits.get(key);
    if (!h || h.resetAt < now) {
      h = { count: 0, resetAt: now + windowMs };
      hits.set(key, h);
    }
    h.count += 1;
    if (h.count > max) {
      const retry = Math.ceil((h.resetAt - now) / 1000);
      res.set("Retry-After", String(retry));
      return res.status(429).json({ error: `Too many requests. Try again in ${retry}s.` });
    }
    next();
  };
}
