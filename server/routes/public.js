import { Router } from "express";
import { query, withTx } from "../db.js";
import { signSession, verifyToken } from "../auth.js";

export const publicRouter = Router();

async function getSettings() {
  const { rows } = await query("SELECT key, value FROM settings");
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return {
    testLength: Number(map.test_length || 20),
    questionSeconds: Number(map.question_seconds || 10),
  };
}

const imgUrl = (id) => (id ? `/api/images/${id}` : null);

publicRouter.get("/config", async (_req, res) => {
  res.json(await getSettings());
});

// Serve an image blob from the DB.
publicRouter.get("/images/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).end();
  const { rows } = await query("SELECT mime, data FROM images WHERE id=$1", [id]);
  if (!rows.length) return res.status(404).end();
  res.set("Content-Type", rows[0].mime);
  res.set("Cache-Control", "public, max-age=31536000, immutable");
  res.send(rows[0].data);
});

// Start a test: validate + consume the voucher, return questions (no answers).
publicRouter.post("/test/start", async (req, res) => {
  const name = (req.body?.name || "").toString().trim().slice(0, 40);
  const code = (req.body?.voucher || "").toString().trim();
  if (!name) return res.status(400).json({ error: "Please enter your name." });
  if (!code) return res.status(400).json({ error: "Please enter a voucher code." });

  const { rows } = await query("SELECT * FROM vouchers WHERE code=$1", [code]);
  const v = rows[0];
  if (!v) return res.status(400).json({ error: "Invalid voucher code." });
  if (v.expires_at && new Date(v.expires_at) < new Date()) {
    return res.status(400).json({ error: "This voucher has expired." });
  }
  const practice = v.type === "admin";
  if (!practice && v.used) {
    return res.status(400).json({ error: "This voucher has already been used." });
  }

  const settings = await getSettings();
  const picked = await withTx(async (client) => {
    if (!practice) {
      // consume-on-start (guard against a race: only succeeds if still unused)
      const upd = await client.query(
        "UPDATE vouchers SET used=true, used_by=$1, used_at=now() WHERE code=$2 AND used=false",
        [name, code]
      );
      if (upd.rowCount === 0) throw new Error("ALREADY_USED");
    }
    const q = await client.query(
      `SELECT id, type, category, prompt, puzzle_image_id
       FROM questions WHERE active = true ORDER BY random() LIMIT $1`,
      [settings.testLength]
    );
    return q.rows;
  }).catch((e) => {
    if (e.message === "ALREADY_USED") return null;
    throw e;
  });

  if (picked === null) return res.status(400).json({ error: "This voucher has already been used." });
  if (picked.length === 0) return res.status(503).json({ error: "No questions available yet." });

  const questions = [];
  for (const row of picked) {
    const opts = await query(
      "SELECT idx, kind, text_value, image_id FROM question_options WHERE question_id=$1 ORDER BY idx",
      [row.id]
    );
    questions.push({
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
    });
  }

  const sessionToken = signSession({
    voucher: code,
    name,
    practice,
    qids: questions.map((q) => q.id),
    startedAt: Date.now(),
  });

  res.json({ sessionToken, questions, settings: { questionSeconds: settings.questionSeconds } });
});

// Submit answers: score on the server (answers never left the server).
publicRouter.post("/test/submit", async (req, res) => {
  const claims = verifyToken(req.body?.sessionToken || "");
  if (!claims || !Array.isArray(claims.qids)) {
    return res.status(401).json({ error: "Invalid or expired test session." });
  }
  const answers = Array.isArray(req.body?.answers) ? req.body.answers : [];
  const chosen = new Map(answers.map((a) => [Number(a.id), a.selectedIndex]));

  const { rows } = await query(
    "SELECT id, category, correct_index FROM questions WHERE id = ANY($1)",
    [claims.qids]
  );
  const byId = new Map(rows.map((r) => [r.id, r]));

  let correct = 0;
  const byCategory = {};
  for (const qid of claims.qids) {
    const q = byId.get(qid);
    if (!q) continue;
    const cat = (byCategory[q.category] ??= { correct: 0, total: 0 });
    cat.total += 1;
    if (chosen.get(qid) === q.correct_index) {
      correct += 1;
      cat.correct += 1;
    }
  }
  const total = claims.qids.length;
  const percent = total ? Math.round((correct / total) * 100) : 0;
  const durationMs = Math.max(0, Date.now() - (claims.startedAt || Date.now()));

  if (!claims.practice) {
    await query(
      `INSERT INTO scores(name, voucher_code, correct, total, percent, duration_ms)
       VALUES($1,$2,$3,$4,$5,$6)
       ON CONFLICT (voucher_code) WHERE voucher_code IS NOT NULL AND excluded = false
       DO NOTHING`,
      [claims.name, claims.voucher, correct, total, percent, durationMs]
    );
  }

  res.json({ correct, total, percent, byCategory, durationMs, practice: !!claims.practice });
});

// Public scoreboard (top to bottom).
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
