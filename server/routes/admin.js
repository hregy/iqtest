import { Router } from "express";
import crypto from "crypto";
import multer from "multer";
import { query, withTx } from "../db.js";
import { config } from "../config.js";
import { signAdmin, requireAdmin } from "../auth.js";

export const adminRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 3 * 1024 * 1024 } });

// ---- login -------------------------------------------------------------
adminRouter.post("/login", (req, res) => {
  const pw = (req.body?.password || "").toString();
  if (pw && pw === config.adminPassword) return res.json({ token: signAdmin() });
  res.status(401).json({ error: "Wrong password." });
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

adminRouter.post("/vouchers", async (req, res) => {
  const count = Math.min(Math.max(Number(req.body?.count) || 1, 1), 500);
  const type = req.body?.type === "admin" ? "admin" : "single";
  const prefix = (req.body?.prefix || "IQ").toString().replace(/[^A-Za-z0-9]/g, "").slice(0, 6) || "IQ";
  const expiresAt = req.body?.expiresAt ? new Date(req.body.expiresAt) : null;
  const created = [];
  for (let i = 0; i < count; i++) {
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = genCode(prefix.toUpperCase());
      try {
        await query(
          "INSERT INTO vouchers(code, type, expires_at) VALUES($1,$2,$3)",
          [code, type, expiresAt]
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

adminRouter.post("/vouchers/:code/reset", async (req, res) => {
  await query(
    "UPDATE vouchers SET used=false, used_by=NULL, used_at=NULL WHERE code=$1",
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

// ---- questions ---------------------------------------------------------
adminRouter.get("/questions", async (_req, res) => {
  const { rows } = await query(
    "SELECT id, ext_id, type, category, prompt, correct_index, active, puzzle_image_id FROM questions ORDER BY id"
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
      correctIndex: q.correct_index,
      active: q.active,
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
        `INSERT INTO questions(type, category, prompt, correct_index, puzzle_image_id)
         VALUES($1,$2,$3,$4,$5) RETURNING id`,
        [type, category, prompt, correctIndex, puzzleId]
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
  const map = { prompt: "prompt", type: "type", category: "category", active: "active", correctIndex: "correct_index" };
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

// ---- settings ----------------------------------------------------------
adminRouter.get("/settings", async (_req, res) => {
  const { rows } = await query("SELECT key, value FROM settings");
  res.json(Object.fromEntries(rows.map((r) => [r.key, r.value])));
});

adminRouter.put("/settings", async (req, res) => {
  for (const key of ["test_length", "question_seconds"]) {
    if (req.body?.[key] !== undefined) {
      await query(
        "INSERT INTO settings(key, value) VALUES($1,$2) ON CONFLICT (key) DO UPDATE SET value=$2",
        [key, String(req.body[key])]
      );
    }
  }
  res.json({ ok: true });
});
