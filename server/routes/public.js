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
    finalPerLevel: Math.max(1, Number(m.final_per_level || 6)),
    finalQuestionSeconds: Number(m.final_question_seconds || 30),
    voucherRequired: (m.voucher_required ?? "1") !== "0",
    dailyAttemptLimit: Math.max(0, Number(m.daily_attempt_limit ?? 3)),
  };
}

const imgUrl = (id) => (id ? `/api/images/${id}` : null);

// Final score = speed-weighted accuracy (accuracy-first, fair). Reproducible
// from stored fields (correct, total, correct_ms) so the board can be recomputed.
//   A = correct/total ; S = 1 - avgCorrectTime/L (avg over CORRECT answers)
//   IQ = 70 + 70*A + B*A*S ,  B = 0.85*70/total (< one correct -> accuracy wins)
// Shared core: A is accuracy in [0,1] (plain or level-weighted); speed bonus S
// is based on the average time over the `correct` answers.
function iqCore(A, total, correct, correctMs, questionSeconds) {
  if (!total) return 70;
  const L = Math.max(1, questionSeconds * 1000);
  let S = 0;
  if (correct > 0) {
    const avg = Math.min(Math.max((correctMs || 0) / correct, 0), L);
    S = 1 - avg / L;
  }
  const B = (0.9 * 70) / total; // < one correct answer -> accuracy always wins
  const iq = Math.max(70, Math.min(145, 70 + 70 * A + B * A * S));
  return Math.round(iq * 100) / 100; // 2-decimal precision (faster -> strictly higher)
}

export function iqFromStored(correct, total, correctMs, questionSeconds) {
  return iqCore(total ? correct / total : 0, total, correct, correctMs, questionSeconds);
}

// Final IQ test: accuracy is level-weighted (harder levels count more), so a
// correct hard question lifts the score more than an easy one.
export function iqWeighted(correctWeight, totalWeight, total, correct, correctMs, questionSeconds) {
  const A = totalWeight > 0 ? correctWeight / totalWeight : 0;
  return iqCore(A, total, correct, correctMs, questionSeconds);
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
    "SELECT idx, kind, text_value, text_value_fa, image_id FROM question_options WHERE question_id=$1 ORDER BY idx",
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
      textFa: o.text_value_fa,
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
    resizes: Math.max(p.resizes || 0, Number(i.resizes) || 0),
    multiTab: !!(p.multiTab || i.multiTab),
  };
}

function evaluateIntegrity(integrity, answers, total, behaviorTracked) {
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

  if (it.multiTab) reasons.push("test open in another tab");
  if ((it.resizes || 0) >= 3) reasons.push(`resized the window ${it.resizes}× during the test`);

  // Behavioral: answered questions but produced no pointer/touch/key input.
  // Only applied when the browser actually reported movement data (a stale/old
  // cached client sends none, and must NOT be falsely flagged).
  if (behaviorTracked) {
    const interactions = (it.moves || 0) + (it.downs || 0) + (it.keys || 0);
    if (answered.length >= 3 && interactions === 0) reasons.push("no mouse/touch input (bot-like)");
    else if (answered.length >= 5 && (it.downs || 0) === 0 && (it.moves || 0) < 3)
      reasons.push("almost no pointer movement (bot-like)");

    // Per-question: selected answers with no input before the click.
    const noInput = answered.filter((a) => a.hadInput === false).length;
    if (answered.length >= 5 && noInput >= Math.ceil(answered.length * 0.6))
      reasons.push("answers selected without interacting");
  }

  // Timing uniformity: humans vary; scripted answers are near-identical.
  const times = answered.map((a) => a.elapsedMs);
  if (times.length >= 8) {
    const mean = times.reduce((s, x) => s + x, 0) / times.length;
    const sd = Math.sqrt(times.reduce((s, x) => s + (x - mean) ** 2, 0) / times.length);
    if (sd < 120 && mean < 4000) reasons.push("uniform answer timing (bot-like)");
  }

  return { flagged: reasons.length > 0, reasons };
}

// 0..100 "humanness": starts at 100, subtracts for each red flag.
function humannessScore(reasons, attempt) {
  let s = 100;
  const has = (k) => reasons.some((r) => r.includes(k));
  if (attempt?.bot_flags?.suspectedBot) s -= 55;
  if (has("no mouse/touch") || has("without interacting") || has("no pointer")) s -= 45;
  if (has("developer tools")) s -= 40;
  if (has("another tab")) s -= 25;
  if (has("improbably fast")) s -= 25;
  if (has("uniform answer timing")) s -= 20;
  if (has("same device as")) s -= 20;
  if (has("identical answer")) s -= 15;
  if (has("off-screen") || has("left the screen")) s -= 10;
  if (has("resized")) s -= 8;
  if (attempt?.is_vpn) s -= 8;
  return Math.max(0, Math.min(100, s));
}

publicRouter.get("/config", async (_req, res) => {
  const s = await getSettings();
  res.json({
    testLength: s.testLength,
    questionSeconds: s.questionSeconds,
    voucherRequired: s.voucherRequired,
    turnstileSiteKey: config.turnstileSiteKey,
  });
});

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

    const settings = await getSettings();
    // Test type: classic (20 random) or final (6 per level × 5 = stratified 30).
    const mode = req.body?.mode === "final" ? "final" : "classic";
    const qSeconds = mode === "final" ? settings.finalQuestionSeconds : settings.questionSeconds;

    // Bot challenge (no-op until Turnstile keys are configured).
    const ip = getClientIp(req);
    const ts = await verifyTurnstile(req.body?.turnstileToken, ip);
    if (!ts.ok) return res.status(400).json({ error: "Bot check failed — please retry." });

    // Identity (drives the per-user daily limit + is stored on the attempt). Same
    // evidence the anti-cheat panel uses: device fingerprint, with IP+device as fallback.
    const clientInfo = req.body?.client && typeof req.body.client === "object" ? req.body.client : {};
    const ua = (clientInfo.ua || req.headers["user-agent"] || "").toString().slice(0, 400);
    const dev = parseUa(ua);
    const fingerprint = (clientInfo.fingerprint || "").toString().slice(0, 64);

    // Voucher handling depends on whether the gate is on.
    //  - gate ON  : a valid voucher is required and consumed (admin code = practice).
    //  - gate OFF : open access; no voucher needed. An admin code still enables a
    //               practice run, anything else is recorded as an "OPEN" attempt.
    let practice = false;
    let voucherCode = code || "OPEN";
    let consumeVoucher = false;

    if (settings.voucherRequired) {
      if (!code) return res.status(400).json({ error: "Please enter a voucher code." });
      const { rows } = await query("SELECT * FROM vouchers WHERE code=$1", [code]);
      const v = rows[0];
      if (!v) return res.status(400).json({ error: "Invalid voucher code." });
      if (v.expires_at && new Date(v.expires_at) < new Date())
        return res.status(400).json({ error: "This voucher has expired." });
      practice = v.type === "admin";
      const unlimited = practice || v.max_uses === 0;
      if (!practice && !unlimited && v.uses >= v.max_uses)
        return res.status(400).json({ error: "This voucher has already been used." });
      voucherCode = code;
      consumeVoucher = !practice;
    } else if (code) {
      // open access, but honour an admin code for practice runs
      const { rows } = await query("SELECT * FROM vouchers WHERE code=$1", [code]);
      const v = rows[0];
      if (v && v.type === "admin" && !(v.expires_at && new Date(v.expires_at) < new Date())) {
        practice = true;
        voucherCode = code;
      }
    }

    // Per-user daily limit (admin-configurable; 0 = unlimited). Skips admin/practice
    // runs. Counts this identity's non-practice attempts of THIS test in the last 24h.
    const dailyLimit = settings.dailyAttemptLimit;
    if (!practice && dailyLimit > 0) {
      const recent = fingerprint
        ? await query(
            `SELECT count(*)::int c FROM attempts
             WHERE practice = false AND test_type = $1 AND fingerprint = $2 AND fingerprint <> ''
               AND created_at > now() - interval '24 hours'`,
            [mode, fingerprint])
        : await query(
            `SELECT count(*)::int c FROM attempts
             WHERE practice = false AND test_type = $1 AND ip = $2 AND device = $3
               AND created_at > now() - interval '24 hours'`,
            [mode, ip, dev.device]);
      if (recent.rows[0].c >= dailyLimit) {
        return res.status(429).json({
          error: `Daily limit reached — you can take this test ${dailyLimit} times per day. Please try again tomorrow.`,
        });
      }
    }

    const picked = await withTx(async (client) => {
      if (consumeVoucher) {
        // consume one use atomically (guards against races / exhaustion)
        const upd = await client.query(
          `UPDATE vouchers
           SET uses = uses + 1, used_by = $1, used_at = now(),
               used = (max_uses > 0 AND uses + 1 >= max_uses)
           WHERE code = $2 AND (max_uses = 0 OR uses < max_uses)`,
          [name, voucherCode]
        );
        if (upd.rowCount === 0) throw new Error("ALREADY_USED");
      }
      if (mode === "final") {
        // Fair stratified sample: an equal random slice from every difficulty level.
        const ids = [];
        for (const lv of [1, 2, 3, 4, 5]) {
          const r = await client.query(
            "SELECT id FROM questions WHERE active = true AND bank = 'final' AND level = $1 ORDER BY random() LIMIT $2",
            [lv, settings.finalPerLevel]
          );
          ids.push(...r.rows.map((x) => x.id));
        }
        return ids;
      }
      const q = await client.query(
        "SELECT id FROM questions WHERE active = true AND bank <> 'final' ORDER BY random() LIMIT $1",
        [settings.testLength]
      );
      return q.rows.map((r) => r.id);
    }).catch((e) => (e.message === "ALREADY_USED" ? null : Promise.reject(e)));

    if (picked === null) return res.status(400).json({ error: "This voucher has already been used." });
    if (!picked.length) return res.status(503).json({ error: "No questions available yet." });

    const id = crypto.randomUUID();
    const nonce = crypto.randomBytes(9).toString("hex");

    // Forensics: IP geo + bot flags (identity/device already computed above).
    const geo = await geoLookup(ip);
    const botFlags = computeBotFlags(clientInfo, geo, ua);
    const isVpn = !!(geo.proxy || geo.hosting);

    await query(
      `INSERT INTO attempts(id, voucher_code, name, practice, qids, idx, current_nonce, served_at,
         ip, country, region, city, isp, is_vpn, ua, browser, os, device, fingerprint, client_info, bot_flags,
         test_type, q_seconds)
       VALUES($1,$2,$3,$4,$5,0,$6, now(),
         $7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)`,
      [id, voucherCode, name, practice, picked, nonce,
       ip, geo.country, geo.region, geo.city, geo.isp, isVpn, ua,
       dev.browser, dev.os, dev.device, fingerprint,
       JSON.stringify(clientInfo), JSON.stringify(botFlags), mode, qSeconds]
    );

    const question = await buildQuestion(picked[0]);
    res.json({
      attemptToken: signSession({ attemptId: id }),
      question,
      nonce,
      index: 0,
      total: picked.length,
      settings: { questionSeconds: qSeconds },
      watermark: `${name} · ${voucherCode} · ${new Date().toISOString().slice(0, 10)}`,
      practice,
      mode,
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
    // The per-question limit is snapshotted on the attempt at start (classic vs
    // final differ); fall back to the live global for old in-flight attempts.
    const seconds = a.q_seconds || settings.questionSeconds;
    const qid = a.qids[a.idx];
    const qrow = (await query("SELECT category, correct_index, weight FROM questions WHERE id=$1", [qid])).rows[0];

    const serverElapsed = Date.now() - new Date(a.served_at).getTime();
    // If the question was confirmed displayed, served_at already == display time
    // (no extra credit). Otherwise fall back to crediting client-reported load.
    const credit = a.display_pinged
      ? 0
      : Math.min(Math.max(Number(req.body?.renderDelayMs) || 0, 0), RENDER_CREDIT_MS);
    const effective = serverElapsed - credit - RTT_GRACE_MS;
    const timedOut = effective > seconds * 1000;

    const sel = req.body?.selectedIndex;
    const selected = sel === null || sel === undefined ? null : Number(sel);
    const isCorrect = !timedOut && qrow && selected === qrow.correct_index;

    const q = req.body?.q || {};
    const answers = a.answers || [];
    answers.push({
      qid,
      category: qrow?.category || "?",
      weight: Number(qrow?.weight) || 1,
      sel: selected,
      correct: !!isCorrect,
      elapsedMs: Math.max(0, Math.round(effective)),
      timedOut,
      hadInput: q.hadInput === undefined ? null : !!q.hadInput,
      msToFirst: Number.isFinite(q.msToFirst) ? q.msToFirst : null,
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
      const behaviorTracked = !!(a.client_info && Object.keys(a.client_info).length > 0);
      const { reasons } = evaluateIntegrity(integrity, answers, total, behaviorTracked);

      // Cluster/collusion: same physical device (fingerprint) used by a
      // different test-taker name.
      if (a.fingerprint) {
        try {
          const cl = await query(
            `SELECT DISTINCT name FROM attempts
             WHERE id <> $1 AND name <> $2 AND status='done' AND fingerprint = $3
             LIMIT 6`,
            [a.id, a.name, a.fingerprint]
          );
          if (cl.rows.length) reasons.push(`same device as other candidate(s): ${cl.rows.map((r) => r.name).join(", ")}`);
        } catch { /* ignore */ }
      }
      const humanness = humannessScore(reasons, a);
      const flagged = reasons.length > 0;
      const durationMs = answers.reduce((s, x) => s + x.elapsedMs, 0);
      const correctMs = correctMsOf(answers, seconds);

      // Final test: level-weighted accuracy (harder levels count more). Classic
      // test: plain accuracy. Store the weighting inputs so recalc stays exact.
      const isFinal = a.test_type === "final";
      const totalWeight = answers.reduce((s, x) => s + (Number(x.weight) || 1), 0);
      const correctWeight = answers.filter((x) => x.correct).reduce((s, x) => s + (Number(x.weight) || 1), 0);
      const iq = isFinal
        ? iqWeighted(correctWeight, totalWeight, total, correct, correctMs, seconds)
        : iqFromStored(correct, total, correctMs, seconds);

      const integrityOut = { ...integrity, reasons, flagged, humanness };
      await query(
        "UPDATE attempts SET idx=$1, correct=$2, answers=$3, integrity=$4, status='done', finished_at=now() WHERE id=$5",
        [nextIdx, correct, JSON.stringify(answers), JSON.stringify(integrityOut), a.id]
      );

      if (!a.practice) {
        await query(
          `INSERT INTO scores(name, voucher_code, correct, total, percent, duration_ms, correct_ms, iq,
                              flagged, excluded, integrity, test_type, correct_weight, total_weight, q_seconds, fingerprint)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$9,$10,$11,$12,$13,$14,$15)`,
          [a.name, a.voucher_code, correct, total, percent, durationMs, correctMs, iq, flagged,
           JSON.stringify(integrityOut), a.test_type || "classic", correctWeight, totalWeight, seconds,
           a.fingerprint || null]
        );
      }
      const review = await buildReview(answers);
      return res.json({
        done: true,
        result: { correct, total, percent, iq, byCategory, durationMs, practice: a.practice, flagged, reasons, humanness, testType: a.test_type || "classic" },
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

// ---- Session recording (rrweb events) for later admin replay.
publicRouter.post(
  "/test/recording",
  rateLimit({ windowMs: 60_000, max: 60, name: "rec" }),
  async (req, res) => {
    const claims = verifyToken(req.body?.attemptToken || "");
    if (!claims?.attemptId) return res.json({ ok: false });
    const events = Array.isArray(req.body?.events) ? req.body.events : [];
    if (!events.length) return res.json({ ok: false });
    const json = JSON.stringify(events);
    if (json.length > 8_000_000) return res.json({ ok: false, tooLarge: true });
    try {
      await query(
        `INSERT INTO session_recordings(attempt_id, events) VALUES($1,$2)
         ON CONFLICT (attempt_id) DO UPDATE SET events=$2, created_at=now()`,
        [claims.attemptId, json]
      );
      res.json({ ok: true });
    } catch {
      res.json({ ok: false });
    }
  }
);

// ---- Public scoreboard (flagged/hidden attempts excluded).
publicRouter.get("/scoreboard", async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 100, 500);
  const type = req.query.type === "final" ? "final" : "classic";
  // Final (level-weighted IQ) and classic (flat IQ) are separate boards — the
  // two IQ numbers aren't comparable. Classic ranks by raw correct count first
  // (unchanged); final ranks by its weighted IQ first.
  const order = type === "final"
    ? "iq DESC NULLS LAST, correct DESC, duration_ms ASC NULLS LAST, created_at ASC"
    : "correct DESC, iq DESC NULLS LAST, duration_ms ASC NULLS LAST, created_at ASC";
  // Best score per (device + name): keep each person's top row, then rank.
  // Keying on name as well as fingerprint means two different people who happen
  // to share a device fingerprint each still appear (and one person's own
  // retries still collapse to their best). Rows without a fingerprint get a
  // unique key so they're never collapsed together.
  const { rows } = await query(
    `SELECT name, correct, total, percent, duration_ms, iq, created_at FROM (
       SELECT DISTINCT ON (COALESCE(NULLIF(fingerprint, ''), 'id:' || id::text), name)
         id, name, correct, total, percent, duration_ms, iq::float8 AS iq, created_at
       FROM scores
       WHERE excluded = false AND test_type = $2
       ORDER BY COALESCE(NULLIF(fingerprint, ''), 'id:' || id::text), name, ${order}
     ) best
     ORDER BY ${order}
     LIMIT $1`,
    [limit, type]
  );
  res.json(rows.map((r, i) => ({ rank: i + 1, ...r })));
});
