import { Router } from "express";
import crypto from "crypto";
import { query, withTx } from "../db.js";
import { signSession, verifyToken } from "../auth.js";
import { rateLimit } from "../ratelimit.js";
import { config } from "../config.js";
import { getClientIp, geoLookup, parseUa, computeBotFlags, verifyTurnstile } from "../forensics.js";

export const publicRouter = Router();

// Timing slack:
//  - the per-question clock is (re)started by the client's "ready" ping when
//    the question is actually displayed; READY_MAX_MS caps how long after the
//    serve we'll accept that ping (bounds any stalling abuse).
//  - if no ready ping arrived, we fall back to crediting client-reported load
//    time up to RENDER_CREDIT_MS.
//  - RTT_GRACE_MS absorbs round-trip jitter.
const READY_MAX_MS = 20000;
const RENDER_CREDIT_MS = 8000;
const RTT_GRACE_MS = 2000;

async function getSettings() {
  const { rows } = await query("SELECT key, value FROM settings");
  const m = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return {
    testLength: Number(m.test_length || 20),
    questionSeconds: Number(m.question_seconds || 10),
  };
}

const imgUrl = (id) => (id ? `/api/images/${id}` : null);

// Final score = speed-weighted accuracy (accuracy-first, fair). Reproducible
// from stored fields (correct, total, correct_ms) so the board can be recomputed.
//   A = correct/total ; S = 1 - avgCorrectTime/L (avg over CORRECT answers)
//   IQ = 70 + 70*A + B*A*S ,  B = 0.85*70/total (< one correct -> accuracy wins)
export function iqFromStored(correct, total, correctMs, questionSeconds) {
  if (!total) return 70;
  const L = Math.max(1, questionSeconds * 1000);
  const A = correct / total;
  let S = 0;
  if (correct > 0) {
    const avg = Math.min(Math.max((correctMs || 0) / correct, 0), L);
    S = 1 - avg / L;
  }
  const B = (0.9 * 70) / total; // < one correct answer -> accuracy always wins
  const iq = Math.max(70, Math.min(145, 70 + 70 * A + B * A * S));
  return Math.round(iq * 100) / 100; // 2-decimal precision (faster -> strictly higher)
}

// Sum of time spent on CORRECT answers (capped per-question at the limit).
export function correctMsOf(answers, questionSeconds) {
  const L = Math.max(1, questionSeconds * 1000);
  return answers
    .filter((a) => a.correct)
    .reduce((s, a) => s + Math.min(Math.max(a.elapsedMs || 0, 0), L), 0);
}

async function buildQuestion(qid) {
  const { rows } = await query(
    "SELECT id, type, category, prompt, prompt_fa, puzzle_image_id FROM questions WHERE id=$1",
    [qid]
  );
  if (!rows.length) return null;
  const row = rows[0];
  const opts = await query(
    "SELECT idx, kind, text_value, image_id FROM question_options WHERE question_id=$1 ORDER BY idx",
    [qid]
  );
  return {
    id: row.id,
    type: row.type,
    category: row.category,
    prompt: row.prompt,
    promptFa: row.prompt_fa,
    puzzleImage: imgUrl(row.puzzle_image_id),
    options: opts.rows.map((o) => ({
      idx: o.idx,
      kind: o.kind,
      text: o.text_value,
      image: imgUrl(o.image_id),
    })),
  };
}

// Per-question review (only built AFTER an attempt is finished): the question,
// the user's answer, the correct answer, time spent, and right/wrong.
export async function buildReview(answers) {
  const out = [];
  for (let i = 0; i < answers.length; i++) {
    const a = answers[i];
    const q = await buildQuestion(a.qid);
    const cr = (await query("SELECT correct_index FROM questions WHERE id=$1", [a.qid])).rows[0];
    out.push({
      index: i,
      prompt: q?.prompt || "",
      promptFa: q?.promptFa || "",
      category: a.category,
      puzzleImage: q?.puzzleImage || null,
      options: q?.options || [],
      correctIndex: cr ? cr.correct_index : null,
      selectedIndex: a.sel,
      correct: !!a.correct,
      timedOut: !!a.timedOut,
      elapsedMs: a.elapsedMs,
    });
  }
  return out;
}

function mergeIntegrity(prev, incoming) {
  const p = prev || {};
  const i = incoming || {};
  return {
    blur: Math.max(p.blur || 0, Number(i.blur) || 0),
    awayMs: Math.max(p.awayMs || 0, Number(i.awayMs) || 0),
    fsExits: Math.max(p.fsExits || 0, Number(i.fsExits) || 0),
    paste: Math.max(p.paste || 0, Number(i.paste) || 0),
    devtools: !!(p.devtools || i.devtools),
    moves: Math.max(p.moves || 0, Number(i.moves) || 0),
    downs: Math.max(p.downs || 0, Number(i.downs) || 0),
    keys: Math.max(p.keys || 0, Number(i.keys) || 0),
    pathPx: Math.max(p.pathPx || 0, Number(i.pathPx) || 0),
  };
}

function evaluateIntegrity(integrity, answers, total) {
  const reasons = [];
  const it = integrity || {};
  if ((it.blur || 0) >= 2) reasons.push(`left the screen ${it.blur}×`);
  if ((it.awayMs || 0) >= 6000) reasons.push(`spent ${Math.round(it.awayMs / 1000)}s off-screen`);
  if (it.devtools) reasons.push("opened developer tools");
  if ((it.fsExits || 0) >= 1) reasons.push("exited full screen");
  if ((it.paste || 0) >= 1) reasons.push("attempted to paste");

  const answered = answers.filter((a) => a.sel !== null);
  const correct = answers.filter((a) => a.correct).length;
  const fast = answered.filter((a) => a.elapsedMs < 800).length;
  if (correct >= Math.ceil(total * 0.8) && fast >= Math.ceil(total * 0.5)) {
    reasons.push("improbably fast and accurate");
  }
  const sels = answered.map((a) => a.sel);
  if (sels.length >= total && new Set(sels).size === 1) reasons.push("identical answer every time");

  // Behavioral: answered questions but produced no pointer/touch/key input.
  const interactions = (it.moves || 0) + (it.downs || 0) + (it.keys || 0);
  if (answered.length >= 3 && interactions === 0) reasons.push("no mouse/touch input (bot-like)");
  else if (answered.length >= 5 && (it.downs || 0) === 0 && (it.moves || 0) < 3)
    reasons.push("almost no pointer movement (bot-like)");

  return { flagged: reasons.length > 0, reasons };
}

publicRouter.get("/config", async (_req, res) =>
  res.json({ ...(await getSettings()), turnstileSiteKey: config.turnstileSiteKey })
);

publicRouter.get("/images/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).end();
  const { rows } = await query("SELECT mime, data FROM images WHERE id=$1", [id]);
  if (!rows.length) return res.status(404).end();
  res.set("Content-Type", rows[0].mime);
  res.set("Cache-Control", "public, max-age=31536000, immutable");
  res.send(rows[0].data);
});

// ---- Start: validate + consume voucher, create attempt, serve first question.
publicRouter.post(
  "/test/start",
  rateLimit({ windowMs: 60_000, max: 15, name: "start" }),
  async (req, res) => {
    const name = (req.body?.name || "").toString().trim().slice(0, 40);
    const code = (req.body?.voucher || "").toString().trim();
    if (!name) return res.status(400).json({ error: "Please enter your name." });
    if (!code) return res.status(400).json({ error: "Please enter a voucher code." });

    // Bot challenge (no-op until Turnstile keys are configured).
    const ip = getClientIp(req);
    const ts = await verifyTurnstile(req.body?.turnstileToken, ip);
    if (!ts.ok) return res.status(400).json({ error: "Bot check failed — please retry." });

    const { rows } = await query("SELECT * FROM vouchers WHERE code=$1", [code]);
    const v = rows[0];
    if (!v) return res.status(400).json({ error: "Invalid voucher code." });
    if (v.expires_at && new Date(v.expires_at) < new Date())
      return res.status(400).json({ error: "This voucher has expired." });
    const practice = v.type === "admin";
    const unlimited = practice || v.max_uses === 0;
    if (!practice && !unlimited && v.uses >= v.max_uses)
      return res.status(400).json({ error: "This voucher has already been used." });

    const settings = await getSettings();
    const picked = await withTx(async (client) => {
      if (!practice) {
        // consume one use atomically (guards against races / exhaustion)
        const upd = await client.query(
          `UPDATE vouchers
           SET uses = uses + 1, used_by = $1, used_at = now(),
               used = (max_uses > 0 AND uses + 1 >= max_uses)
           WHERE code = $2 AND (max_uses = 0 OR uses < max_uses)`,
          [name, code]
        );
        if (upd.rowCount === 0) throw new Error("ALREADY_USED");
      }
      const q = await client.query(
        "SELECT id FROM questions WHERE active = true ORDER BY random() LIMIT $1",
        [settings.testLength]
      );
      return q.rows.map((r) => r.id);
    }).catch((e) => (e.message === "ALREADY_USED" ? null : Promise.reject(e)));

    if (picked === null) return res.status(400).json({ error: "This voucher has already been used." });
    if (!picked.length) return res.status(503).json({ error: "No questions available yet." });

    const id = crypto.randomUUID();
    const nonce = crypto.randomBytes(9).toString("hex");

    // Forensics: IP geo, device, bot flags.
    const client = req.body?.client && typeof req.body.client === "object" ? req.body.client : {};
    const ua = (client.ua || req.headers["user-agent"] || "").toString().slice(0, 400);
    const geo = await geoLookup(ip);
    const dev = parseUa(ua);
    const botFlags = computeBotFlags(client, geo, ua);
    const isVpn = !!(geo.proxy || geo.hosting);

    await query(
      `INSERT INTO attempts(id, voucher_code, name, practice, qids, idx, current_nonce, served_at,
         ip, country, region, city, isp, is_vpn, ua, browser, os, device, fingerprint, client_info, bot_flags)
       VALUES($1,$2,$3,$4,$5,0,$6, now(),
         $7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)`,
      [id, code, name, practice, picked, nonce,
       ip, geo.country, geo.region, geo.city, geo.isp, isVpn, ua,
       dev.browser, dev.os, dev.device, (client.fingerprint || "").toString().slice(0, 64),
       JSON.stringify(client), JSON.stringify(botFlags)]
    );

    const question = await buildQuestion(picked[0]);
    res.json({
      attemptToken: signSession({ attemptId: id }),
      question,
      nonce,
      index: 0,
      total: picked.length,
      settings: { questionSeconds: settings.questionSeconds },
      watermark: `${name} · ${code} · ${new Date().toISOString().slice(0, 10)}`,
      practice,
    });
  }
);

// ---- Answer one question: server checks timing + nonce, advances or finishes.
publicRouter.post(
  "/test/answer",
  rateLimit({ windowMs: 60_000, max: 120, name: "answer" }),
  async (req, res) => {
    const claims = verifyToken(req.body?.attemptToken || "");
    if (!claims?.attemptId) return res.status(401).json({ error: "Invalid test session." });

    const { rows } = await query("SELECT * FROM attempts WHERE id=$1", [claims.attemptId]);
    const a = rows[0];
    if (!a) return res.status(404).json({ error: "Attempt not found." });
    if (a.status !== "active") return res.status(409).json({ error: "Test already finished." });
    if ((req.body?.nonce || "") !== a.current_nonce)
      return res.status(409).json({ error: "Out-of-order submission rejected." });

    const settings = await getSettings();
    const qid = a.qids[a.idx];
    const qrow = (await query("SELECT category, correct_index FROM questions WHERE id=$1", [qid])).rows[0];

    const serverElapsed = Date.now() - new Date(a.served_at).getTime();
    // If the question was confirmed displayed, served_at already == display time
    // (no extra credit). Otherwise fall back to crediting client-reported load.
    const credit = a.display_pinged
      ? 0
      : Math.min(Math.max(Number(req.body?.renderDelayMs) || 0, 0), RENDER_CREDIT_MS);
    const effective = serverElapsed - credit - RTT_GRACE_MS;
    const timedOut = effective > settings.questionSeconds * 1000;

    const sel = req.body?.selectedIndex;
    const selected = sel === null || sel === undefined ? null : Number(sel);
    const isCorrect = !timedOut && qrow && selected === qrow.correct_index;

    const answers = a.answers || [];
    answers.push({
      qid,
      category: qrow?.category || "?",
      sel: selected,
      correct: !!isCorrect,
      elapsedMs: Math.max(0, Math.round(effective)),
      timedOut,
    });
    const correct = a.correct + (isCorrect ? 1 : 0);
    const integrity = mergeIntegrity(a.integrity, req.body?.integrity);
    const nextIdx = a.idx + 1;
    const total = a.qids.length;

    if (nextIdx >= total) {
      const percent = total ? Math.round((correct / total) * 100) : 0;
      const byCategory = {};
      for (const ans of answers) {
        const c = (byCategory[ans.category] ??= { correct: 0, total: 0 });
        c.total += 1;
        if (ans.correct) c.correct += 1;
      }
      const { flagged, reasons } = evaluateIntegrity(integrity, answers, total);
      const durationMs = answers.reduce((s, x) => s + x.elapsedMs, 0);
      const correctMs = correctMsOf(answers, settings.questionSeconds);
      const iq = iqFromStored(correct, total, correctMs, settings.questionSeconds);

      await query(
        "UPDATE attempts SET idx=$1, correct=$2, answers=$3, integrity=$4, status='done', finished_at=now() WHERE id=$5",
        [nextIdx, correct, JSON.stringify(answers), JSON.stringify({ ...integrity, reasons, flagged }), a.id]
      );

      if (!a.practice) {
        await query(
          `INSERT INTO scores(name, voucher_code, correct, total, percent, duration_ms, correct_ms, iq, flagged, excluded, integrity)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$9,$10)`,
          [a.name, a.voucher_code, correct, total, percent, durationMs, correctMs, iq, flagged,
           JSON.stringify({ ...integrity, reasons })]
        );
      }
      const review = await buildReview(answers);
      return res.json({
        done: true,
        result: { correct, total, percent, iq, byCategory, durationMs, practice: a.practice, flagged, reasons },
        review,
      });
    }

    const nonce = crypto.randomBytes(9).toString("hex");
    await query(
      "UPDATE attempts SET idx=$1, correct=$2, answers=$3, integrity=$4, current_nonce=$5, served_at=now(), display_pinged=false WHERE id=$6",
      [nextIdx, correct, JSON.stringify(answers), JSON.stringify(integrity), nonce, a.id]
    );
    const question = await buildQuestion(a.qids[nextIdx]);
    res.json({ done: false, question, nonce, index: nextIdx, total });
  }
);

// ---- Ready ping: the question is displayed, so (re)start its clock now.
publicRouter.post(
  "/test/ready",
  rateLimit({ windowMs: 60_000, max: 200, name: "ready" }),
  async (req, res) => {
    const claims = verifyToken(req.body?.attemptToken || "");
    if (!claims?.attemptId) return res.json({ ok: false });
    const { rows } = await query(
      "SELECT id, status, current_nonce, served_at, display_pinged FROM attempts WHERE id=$1",
      [claims.attemptId]
    );
    const a = rows[0];
    if (!a || a.status !== "active" || (req.body?.nonce || "") !== a.current_nonce) {
      return res.json({ ok: false });
    }
    if (!a.display_pinged && Date.now() - new Date(a.served_at).getTime() < READY_MAX_MS) {
      await query("UPDATE attempts SET served_at=now(), display_pinged=true WHERE id=$1", [a.id]);
    }
    res.json({ ok: true });
  }
);

// ---- Public scoreboard (flagged/hidden attempts excluded).
publicRouter.get("/scoreboard", async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 100, 500);
  const { rows } = await query(
    `SELECT name, correct, total, percent, duration_ms, iq::float8 AS iq, created_at
     FROM scores WHERE excluded = false
     ORDER BY correct DESC, iq DESC NULLS LAST, duration_ms ASC NULLS LAST, created_at ASC
     LIMIT $1`,
    [limit]
  );
  res.json(rows.map((r, i) => ({ rank: i + 1, ...r })));
});
