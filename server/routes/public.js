import { Router } from "express";
import crypto from "crypto";
import { query, withTx } from "../db.js";
import { signSession, verifyToken } from "../auth.js";
import { rateLimit } from "../ratelimit.js";

export const publicRouter = Router();

// How much slack the server gives over the displayed timer:
//  - up to RENDER_CREDIT_MS is credited back for genuine image-load time
//    (client-reported, capped so it can't be abused)
//  - RTT_GRACE_MS absorbs network round-trip jitter
const RENDER_CREDIT_MS = 4000;
const RTT_GRACE_MS = 1500;

async function getSettings() {
  const { rows } = await query("SELECT key, value FROM settings");
  const m = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return {
    testLength: Number(m.test_length || 20),
    questionSeconds: Number(m.question_seconds || 10),
  };
}

const imgUrl = (id) => (id ? `/api/images/${id}` : null);

async function buildQuestion(qid) {
  const { rows } = await query(
    "SELECT id, type, category, prompt, puzzle_image_id FROM questions WHERE id=$1",
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
    puzzleImage: imgUrl(row.puzzle_image_id),
    options: opts.rows.map((o) => ({
      idx: o.idx,
      kind: o.kind,
      text: o.text_value,
      image: imgUrl(o.image_id),
    })),
  };
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

  return { flagged: reasons.length > 0, reasons };
}

publicRouter.get("/config", async (_req, res) => res.json(await getSettings()));

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

    const { rows } = await query("SELECT * FROM vouchers WHERE code=$1", [code]);
    const v = rows[0];
    if (!v) return res.status(400).json({ error: "Invalid voucher code." });
    if (v.expires_at && new Date(v.expires_at) < new Date())
      return res.status(400).json({ error: "This voucher has expired." });
    const practice = v.type === "admin";
    if (!practice && v.used)
      return res.status(400).json({ error: "This voucher has already been used." });

    const settings = await getSettings();
    const picked = await withTx(async (client) => {
      if (!practice) {
        const upd = await client.query(
          "UPDATE vouchers SET used=true, used_by=$1, used_at=now() WHERE code=$2 AND used=false",
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
    await query(
      `INSERT INTO attempts(id, voucher_code, name, practice, qids, idx, current_nonce, served_at)
       VALUES($1,$2,$3,$4,$5,0,$6, now())`,
      [id, code, name, practice, picked, nonce]
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
    const renderCredit = Math.min(Math.max(Number(req.body?.renderDelayMs) || 0, 0), RENDER_CREDIT_MS);
    const effective = serverElapsed - renderCredit - RTT_GRACE_MS;
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

      await query(
        "UPDATE attempts SET idx=$1, correct=$2, answers=$3, integrity=$4, status='done', finished_at=now() WHERE id=$5",
        [nextIdx, correct, JSON.stringify(answers), JSON.stringify(integrity), a.id]
      );

      if (!a.practice) {
        await query(
          `INSERT INTO scores(name, voucher_code, correct, total, percent, duration_ms, flagged, excluded, integrity)
           VALUES($1,$2,$3,$4,$5,$6,$7,$7,$8)
           ON CONFLICT (voucher_code) WHERE voucher_code IS NOT NULL AND excluded = false DO NOTHING`,
          [a.name, a.voucher_code, correct, total, percent, durationMs, flagged,
           JSON.stringify({ ...integrity, reasons })]
        );
      }
      return res.json({
        done: true,
        result: { correct, total, percent, byCategory, durationMs, practice: a.practice, flagged, reasons },
      });
    }

    const nonce = crypto.randomBytes(9).toString("hex");
    await query(
      "UPDATE attempts SET idx=$1, correct=$2, answers=$3, integrity=$4, current_nonce=$5, served_at=now() WHERE id=$6",
      [nextIdx, correct, JSON.stringify(answers), JSON.stringify(integrity), nonce, a.id]
    );
    const question = await buildQuestion(a.qids[nextIdx]);
    res.json({ done: false, question, nonce, index: nextIdx, total });
  }
);

// ---- Public scoreboard (flagged/hidden attempts excluded).
publicRouter.get("/scoreboard", async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 100, 500);
  const { rows } = await query(
    `SELECT name, correct, total, percent, duration_ms, created_at
     FROM scores WHERE excluded = false
     ORDER BY correct DESC, duration_ms ASC NULLS LAST, created_at ASC
     LIMIT $1`,
    [limit]
  );
  res.json(rows.map((r, i) => ({ rank: i + 1, ...r })));
});
