import { Router } from "express";
import crypto from "crypto";
import multer from "multer";
import { query, withTx } from "../db.js";
import { config } from "../config.js";
import { requireAdmin, checkAdminPassword, setAdminCookie, clearAdminCookie } from "../auth.js";
import { rateLimit } from "../ratelimit.js";
import { buildReview } from "./public.js";
import { recalcScores } from "../recalc.js";

export const adminRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 3 * 1024 * 1024 } });

// ---- login (rate-limited; sets an httpOnly session cookie) -------------
adminRouter.post("/login", rateLimit({ windowMs: 60_000, max: 10, name: "login" }), (req, res) => {
  const pw = (req.body?.password || "").toString();
  if (checkAdminPassword(pw)) {
    setAdminCookie(req, res);
    return res.json({ ok: true });
  }
  res.status(401).json({ error: "Wrong password." });
});

adminRouter.post("/logout", (req, res) => {
  clearAdminCookie(res);
  res.json({ ok: true });
});

// everything below requires admin
adminRouter.use(requireAdmin);

adminRouter.get("/me", (_req, res) => res.json({ ok: true, adminVoucher: config.adminVoucher }));

// ---- vouchers ----------------------------------------------------------
function genCode(prefix) {
  const alpha = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (const b of crypto.randomBytes(6)) s += alpha[b % alpha.length];
  return `${prefix}-${s}`;
}

adminRouter.get("/vouchers", async (_req, res) => {
  const { rows } = await query("SELECT * FROM vouchers ORDER BY created_at DESC");
  res.json(rows);
});

const USES_MAP = { single: 1, double: 2, unlimited: 0 };

adminRouter.post("/vouchers", async (req, res) => {
  const count = Math.min(Math.max(Number(req.body?.count) || 1, 1), 500);
  const maxUses = USES_MAP[req.body?.uses] ?? 1;
  const note = (req.body?.note || "").toString().slice(0, 80);
  const prefix = (req.body?.prefix || "IQ").toString().replace(/[^A-Za-z0-9]/g, "").slice(0, 6) || "IQ";
  const expiresAt = req.body?.expiresAt ? new Date(req.body.expiresAt) : null;
  const created = [];
  for (let i = 0; i < count; i++) {
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = genCode(prefix.toUpperCase());
      try {
        await query(
          "INSERT INTO vouchers(code, type, max_uses, note, expires_at) VALUES($1,'single',$2,$3,$4)",
          [code, maxUses, note, expiresAt]
        );
        created.push(code);
        break;
      } catch {
        /* collision, retry */
      }
    }
  }
  res.json({ created });
});

adminRouter.patch("/vouchers/:code", async (req, res) => {
  if (req.body?.note !== undefined) {
    await query("UPDATE vouchers SET note=$1 WHERE code=$2",
      [(req.body.note || "").toString().slice(0, 80), req.params.code]);
  }
  res.json({ ok: true });
});

adminRouter.post("/vouchers/:code/reset", async (req, res) => {
  await query(
    "UPDATE vouchers SET used=false, uses=0, used_by=NULL, used_at=NULL WHERE code=$1",
    [req.params.code]
  );
  res.json({ ok: true });
});

adminRouter.delete("/vouchers/:code", async (req, res) => {
  await query("DELETE FROM vouchers WHERE code=$1", [req.params.code]);
  res.json({ ok: true });
});

// ---- scores ------------------------------------------------------------
adminRouter.get("/scores", async (_req, res) => {
  const { rows } = await query(
    "SELECT * FROM scores ORDER BY correct DESC, duration_ms ASC NULLS LAST, created_at ASC"
  );
  res.json(rows);
});

adminRouter.patch("/scores/:id", async (req, res) => {
  const id = Number(req.params.id);
  const fields = [];
  const vals = [];
  let n = 1;
  for (const key of ["name", "correct", "total", "excluded"]) {
    if (req.body?.[key] !== undefined) {
      fields.push(`${key}=$${n++}`);
      vals.push(req.body[key]);
    }
  }
  if (req.body?.correct !== undefined || req.body?.total !== undefined) {
    // keep percent consistent
    const cur = (await query("SELECT correct, total FROM scores WHERE id=$1", [id])).rows[0] || {};
    const correct = req.body?.correct ?? cur.correct;
    const total = req.body?.total ?? cur.total;
    fields.push(`percent=$${n++}`);
    vals.push(total ? Math.round((correct / total) * 100) : 0);
  }
  if (!fields.length) return res.json({ ok: true });
  vals.push(id);
  await query(`UPDATE scores SET ${fields.join(", ")} WHERE id=$${n}`, vals);
  res.json({ ok: true });
});

adminRouter.delete("/scores/:id", async (req, res) => {
  await query("DELETE FROM scores WHERE id=$1", [Number(req.params.id)]);
  res.json({ ok: true });
});

adminRouter.delete("/scores", async (_req, res) => {
  await query("DELETE FROM scores");
  res.json({ ok: true });
});

adminRouter.post("/scores/recalc", async (_req, res) => {
  const n = await recalcScores();
  res.json({ ok: true, recalculated: n });
});

// ---- questions ---------------------------------------------------------
adminRouter.get("/questions", async (_req, res) => {
  const { rows } = await query(
    "SELECT id, ext_id, type, category, prompt, prompt_fa, correct_index, active, puzzle_image_id, bank, level FROM questions ORDER BY id"
  );
  const out = [];
  for (const q of rows) {
    const opts = await query(
      "SELECT idx, kind, text_value, image_id FROM question_options WHERE question_id=$1 ORDER BY idx",
      [q.id]
    );
    out.push({
      id: q.id,
      ext_id: q.ext_id,
      type: q.type,
      category: q.category,
      prompt: q.prompt,
      promptFa: q.prompt_fa,
      correctIndex: q.correct_index,
      active: q.active,
      bank: q.bank,
      level: q.level,
      puzzleImage: q.puzzle_image_id ? `/api/images/${q.puzzle_image_id}` : null,
      options: opts.rows.map((o) => ({
        idx: o.idx,
        kind: o.kind,
        text: o.text_value,
        image: o.image_id ? `/api/images/${o.image_id}` : null,
      })),
    });
  }
  res.json(out);
});

const optionFields = [
  { name: "puzzle", maxCount: 1 },
  { name: "opt0", maxCount: 1 },
  { name: "opt1", maxCount: 1 },
  { name: "opt2", maxCount: 1 },
  { name: "opt3", maxCount: 1 },
];

adminRouter.post("/questions", upload.fields(optionFields), async (req, res) => {
  try {
    const type = (req.body.type || "custom").toString();
    const category = (req.body.category || "custom").toString();
    const prompt = (req.body.prompt || "").toString();
    const promptFa = (req.body.promptFa || "").toString();
    const optionKind = req.body.optionKind === "text" ? "text" : "image";
    const correctIndex = Number(req.body.correctIndex);
    if (!(correctIndex >= 0 && correctIndex <= 3)) {
      return res.status(400).json({ error: "correctIndex must be 0-3" });
    }
    const files = req.files || {};

    const insertImage = async (client, file) => {
      const r = await client.query(
        "INSERT INTO images(mime, data) VALUES($1,$2) RETURNING id",
        [file.mimetype || "image/png", file.buffer]
      );
      return r.rows[0].id;
    };

    const id = await withTx(async (client) => {
      const puzzleId = files.puzzle?.[0] ? await insertImage(client, files.puzzle[0]) : null;
      const r = await client.query(
        `INSERT INTO questions(type, category, prompt, prompt_fa, correct_index, puzzle_image_id)
         VALUES($1,$2,$3,$4,$5,$6) RETURNING id`,
        [type, category, prompt, promptFa, correctIndex, puzzleId]
      );
      const qid = r.rows[0].id;
      for (let i = 0; i < 4; i++) {
        if (optionKind === "image") {
          const f = files[`opt${i}`]?.[0];
          if (!f) throw new Error(`Missing image for option ${i}`);
          const imgId = await insertImage(client, f);
          await client.query(
            "INSERT INTO question_options(question_id, idx, kind, image_id) VALUES($1,$2,'image',$3)",
            [qid, i, imgId]
          );
        } else {
          const t = (req.body[`text${i}`] || "").toString();
          await client.query(
            "INSERT INTO question_options(question_id, idx, kind, text_value) VALUES($1,$2,'text',$3)",
            [qid, i, t]
          );
        }
      }
      return qid;
    });
    res.json({ ok: true, id });
  } catch (e) {
    res.status(400).json({ error: e.message || "Failed to create question" });
  }
});

adminRouter.patch("/questions/:id", async (req, res) => {
  const id = Number(req.params.id);
  const fields = [];
  const vals = [];
  let n = 1;
  const map = { prompt: "prompt", promptFa: "prompt_fa", type: "type", category: "category", active: "active", correctIndex: "correct_index" };
  for (const [k, col] of Object.entries(map)) {
    if (req.body?.[k] !== undefined) {
      fields.push(`${col}=$${n++}`);
      vals.push(req.body[k]);
    }
  }
  if (!fields.length) return res.json({ ok: true });
  vals.push(id);
  await query(`UPDATE questions SET ${fields.join(", ")} WHERE id=$${n}`, vals);
  res.json({ ok: true });
});

adminRouter.delete("/questions/:id", async (req, res) => {
  await query("DELETE FROM questions WHERE id=$1", [Number(req.params.id)]);
  res.json({ ok: true });
});

// ---- attempts / per-question reports ----------------------------------
adminRouter.get("/attempts", async (_req, res) => {
  const { rows } = await query(
    `SELECT id, name, voucher_code, practice, correct,
            cardinality(qids) AS total, status, created_at, finished_at, integrity,
            ip, country, city, isp, is_vpn, browser, os, device, fingerprint, bot_flags
     FROM attempts WHERE status='done'
     ORDER BY finished_at DESC NULLS LAST LIMIT 500`
  );
  res.json(rows.map((r) => ({
    ...r,
    humanness: r.integrity && typeof r.integrity.humanness === "number" ? r.integrity.humanness : null,
    flagged: !!(
      (r.integrity && (r.integrity.reasons || []).length) ||
      (r.bot_flags && (r.bot_flags.reasons || []).length)
    ),
  })));
});

adminRouter.get("/attempts/:id/review", async (req, res) => {
  const { rows } = await query("SELECT * FROM attempts WHERE id=$1", [req.params.id]);
  const a = rows[0];
  if (!a) return res.status(404).json({ error: "Attempt not found" });
  const answers = a.answers || [];
  const review = await buildReview(answers);
  const durationMs = answers.reduce((s, x) => s + (x.elapsedMs || 0), 0);

  // Other attempts that share this IP or device fingerprint (different people?).
  const matches = await query(
    `SELECT DISTINCT name, ip, fingerprint, created_at FROM attempts
     WHERE id <> $1 AND ((ip IS NOT NULL AND ip = $2) OR (fingerprint <> '' AND fingerprint = $3))
     ORDER BY created_at DESC LIMIT 50`,
    [a.id, a.ip, a.fingerprint || ""]
  );

  res.json({
    id: a.id,
    name: a.name,
    voucher: a.voucher_code,
    practice: a.practice,
    correct: a.correct,
    total: a.qids.length,
    durationMs,
    integrity: a.integrity || {},
    forensics: {
      ip: a.ip, country: a.country, region: a.region, city: a.city, isp: a.isp,
      isVpn: a.is_vpn, ua: a.ua, browser: a.browser, os: a.os, device: a.device,
      fingerprint: a.fingerprint, client: a.client_info, botFlags: a.bot_flags,
    },
    matches: matches.rows,
    review,
  });
});

adminRouter.get("/attempts/:id/recording", async (req, res) => {
  const { rows } = await query("SELECT events FROM session_recordings WHERE attempt_id=$1", [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: "No recording for this attempt" });
  res.json({ events: JSON.parse(rows[0].events) });
});

// ---- anti-cheat: cluster attempts into likely-same-person identities --------
// Union attempts that share a strong identifier. Two link types:
//   strong  = same non-empty device fingerprint
//   medium  = same IP + same device profile (browser/os/device)
// IP-only matches are reported as "same network" but NOT merged (a household or
// office shares one IP without being one person). The headline signal is a single
// device/identity used under several different names.
adminRouter.get("/anticheat", async (_req, res) => {
  const { rows } = await query(
    `SELECT id, name, ip, fingerprint, device, os, browser, country, region, city, isp,
            is_vpn, correct, cardinality(qids) AS total, test_type, practice, created_at, integrity, bot_flags
     FROM attempts WHERE status='done'
     ORDER BY created_at DESC LIMIT 2000`
  );

  const a = rows.map((r) => ({
    ...r,
    fp: (r.fingerprint || "").trim(),
    deviceKey: [r.device, r.os, r.browser].filter(Boolean).join(" · "),
    humanness: r.integrity && typeof r.integrity.humanness === "number" ? r.integrity.humanness : null,
    flagged: !!((r.integrity && (r.integrity.reasons || []).length) || (r.bot_flags && (r.bot_flags.reasons || []).length)),
    reasons: [...((r.integrity && r.integrity.reasons) || []), ...((r.bot_flags && r.bot_flags.reasons) || [])],
  }));

  // union-find over attempt indices
  const parent = a.map((_, i) => i);
  const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
  const union = (x, y) => { const rx = find(x), ry = find(y); if (rx !== ry) parent[rx] = ry; };

  const byFp = new Map();      // fingerprint -> first index
  const byIpDev = new Map();   // ip|deviceKey -> first index
  a.forEach((it, i) => {
    if (it.fp) {
      if (byFp.has(it.fp)) union(i, byFp.get(it.fp)); else byFp.set(it.fp, i);
    }
    if (it.ip && it.deviceKey) {
      const k = it.ip + "¦" + it.deviceKey;
      if (byIpDev.has(k)) union(i, byIpDev.get(k)); else byIpDev.set(k, i);
    }
  });

  // group by root
  const groups = new Map();
  a.forEach((_, i) => { const r = find(i); (groups.get(r) || groups.set(r, []).get(r)).push(i); });

  const uniq = (xs) => [...new Set(xs.filter(Boolean))];
  const clusters = [];
  for (const idxs of groups.values()) {
    if (idxs.length < 2) continue; // singletons aren't interesting
    const members = idxs.map((i) => a[i]).sort((x, y) => new Date(y.created_at) - new Date(x.created_at));
    const names = uniq(members.map((m) => m.name));
    const fps = uniq(members.map((m) => m.fp));
    const ips = uniq(members.map((m) => m.ip));
    // strong if at least two members share one fingerprint
    const fpCounts = {};
    members.forEach((m) => { if (m.fp) fpCounts[m.fp] = (fpCounts[m.fp] || 0) + 1; });
    const sharedFp = Object.entries(fpCounts).find(([, c]) => c >= 2);
    const confidence = sharedFp ? "strong" : "medium";
    const flaggedCount = members.filter((m) => m.flagged).length;
    const vpn = members.some((m) => m.is_vpn);
    const best = members.reduce((b, m) => (m.correct > (b?.correct ?? -1) ? m : b), null);

    const evidence = [];
    if (sharedFp) evidence.push(`same device fingerprint (…${sharedFp[0].slice(-6)})`);
    if (confidence === "medium") evidence.push("same IP + device profile");
    if (names.length >= 2) evidence.push(`${names.length} different names`);
    if (vpn) evidence.push("VPN/proxy");

    clusters.push({
      id: `c${idxs[0]}`,
      confidence,
      evidence,
      names,
      fingerprints: fps,
      ips,
      devices: uniq(members.map((m) => m.deviceKey)),
      locations: uniq(members.map((m) => [m.city, m.country].filter(Boolean).join(", "))),
      vpn,
      attempts: members.length,
      distinctNames: names.length,
      flaggedCount,
      bestCorrect: best ? best.correct : 0,
      bestTotal: best ? best.total : 0,
      firstSeen: members[members.length - 1].created_at,
      lastSeen: members[0].created_at,
      members: members.map((m) => ({
        id: m.id, name: m.name, ip: m.ip, fingerprint: m.fp ? m.fp.slice(0, 12) : null,
        device: m.deviceKey, location: [m.city, m.country].filter(Boolean).join(", "),
        correct: m.correct, total: m.total, testType: m.test_type, practice: m.practice,
        humanness: m.humanness, flagged: m.flagged, isVpn: m.is_vpn, createdAt: m.created_at,
      })),
    });
  }
  // most suspicious first: many names, then many attempts, then flagged
  clusters.sort((x, y) => y.distinctNames - x.distinctNames || y.attempts - x.attempts || y.flaggedCount - x.flaggedCount);

  // one name appearing across multiple devices (sharing / impersonation)
  const nameDevices = new Map();
  a.forEach((it) => {
    const key = it.fp || (it.ip && it.deviceKey ? it.ip + "¦" + it.deviceKey : null);
    if (!key) return;
    const s = nameDevices.get(it.name) || new Set();
    s.add(key); nameDevices.set(it.name, s);
  });
  const sharedNames = [...nameDevices.entries()].filter(([, s]) => s.size >= 2).map(([name, s]) => ({ name, devices: s.size }));

  res.json({
    summary: {
      attempts: a.length,
      distinctDevices: byFp.size,
      identityClusters: clusters.length,
      multiNameClusters: clusters.filter((c) => c.distinctNames >= 2).length,
      flagged: a.filter((x) => x.flagged).length,
      onVpn: a.filter((x) => x.is_vpn).length,
    },
    clusters,
    sharedNames,
  });
});

// Exclude (or re-include) every score from a given device fingerprint in one click.
// (Path avoids the /scores/:id PATCH route, which would otherwise shadow it.)
adminRouter.patch("/exclude-device", async (req, res) => {
  const fp = (req.body?.fingerprint || "").toString();
  const excluded = req.body?.excluded !== false;
  if (!fp) return res.status(400).json({ error: "fingerprint required" });
  const r = await query("UPDATE scores SET excluded=$1, flagged = ($1 OR flagged) WHERE fingerprint=$2", [excluded, fp]);
  res.json({ ok: true, updated: r.rowCount });
});

// ---- settings ----------------------------------------------------------
adminRouter.get("/settings", async (_req, res) => {
  const { rows } = await query("SELECT key, value FROM settings");
  res.json(Object.fromEntries(rows.map((r) => [r.key, r.value])));
});

adminRouter.put("/settings", async (req, res) => {
  for (const key of ["test_length", "question_seconds", "final_per_level", "final_question_seconds", "voucher_required"]) {
    if (req.body?.[key] !== undefined) {
      await query(
        "INSERT INTO settings(key, value) VALUES($1,$2) ON CONFLICT (key) DO UPDATE SET value=$2",
        [key, String(req.body[key])]
      );
    }
  }
  res.json({ ok: true });
});
