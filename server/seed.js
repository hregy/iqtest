// Schema init + seed loader for the generated 100 questions + images.
//   import { initDb }  -> called by the server on boot (idempotent)
//   node server/seed.js -> CLI: applies schema and (re)loads the 100 questions
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { pool, query, withTx } from "./db.js";
import { config } from "./config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ASSET_DIR = path.join(__dirname, "..", "scripts", "seed_assets");
const SEED_DATA = path.join(__dirname, "..", "scripts", "seed_data.json");

async function applySchema() {
  await query(fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8"));
}

async function ensureSettings() {
  for (const [k, v] of Object.entries({ test_length: "20", question_seconds: "10" })) {
    await query("INSERT INTO settings(key, value) VALUES($1,$2) ON CONFLICT (key) DO NOTHING", [k, v]);
  }
}

async function ensureAdminVoucher() {
  await query(
    `INSERT INTO vouchers(code, type) VALUES($1,'admin')
     ON CONFLICT (code) DO UPDATE SET type='admin', used=false, expires_at=NULL`,
    [config.adminVoucher]
  );
}

async function countQuestions() {
  const { rows } = await query("SELECT count(*)::int AS c FROM questions");
  return rows[0].c;
}

async function insertImage(client, file) {
  const data = fs.readFileSync(path.join(ASSET_DIR, file));
  const { rows } = await client.query(
    "INSERT INTO images(mime, data) VALUES($1,$2) RETURNING id",
    ["image/svg+xml", data]
  );
  return rows[0].id;
}

export async function seedQuestions() {
  if (!fs.existsSync(SEED_DATA)) {
    console.warn("seed_data.json not found; skipping question seed.");
    return 0;
  }
  const seed = JSON.parse(fs.readFileSync(SEED_DATA, "utf8"));
  // remove previously-seeded questions (ext_id q###) + their images
  await withTx(async (client) => {
    const { rows: old } = await client.query(
      "SELECT id, puzzle_image_id FROM questions WHERE ext_id LIKE 'q%'"
    );
    for (const q of old) {
      const opts = await client.query("SELECT image_id FROM question_options WHERE question_id=$1", [q.id]);
      await client.query("DELETE FROM questions WHERE id=$1", [q.id]);
      const imgIds = [q.puzzle_image_id, ...opts.rows.map((o) => o.image_id)].filter(Boolean);
      if (imgIds.length) await client.query("DELETE FROM images WHERE id = ANY($1)", [imgIds]);
    }
  });
  for (const q of seed) {
    await withTx(async (client) => {
      const puzzleId = q.has_puzzle ? await insertImage(client, `${q.ext_id}_puzzle.svg`) : null;
      const { rows } = await client.query(
        `INSERT INTO questions(ext_id, type, category, prompt, correct_index, puzzle_image_id)
         VALUES($1,$2,$3,$4,$5,$6) RETURNING id`,
        [q.ext_id, q.type, q.category, q.prompt, q.correctIndex, puzzleId]
      );
      const qid = rows[0].id;
      for (let i = 0; i < 4; i++) {
        const imgId = await insertImage(client, `${q.ext_id}_opt${i}.svg`);
        await client.query(
          "INSERT INTO question_options(question_id, idx, kind, image_id) VALUES($1,$2,'image',$3)",
          [qid, i, imgId]
        );
      }
    });
  }
  return seed.length;
}

// Idempotent boot init: schema + settings + admin voucher, seed only if empty.
export async function initDb({ seedIfEmpty = false } = {}) {
  await applySchema();
  await ensureSettings();
  await ensureAdminVoucher();
  if (seedIfEmpty && (await countQuestions()) === 0) {
    const n = await seedQuestions();
    console.log(`Seeded ${n} questions on first boot.`);
  }
}

// CLI entry: force (re)seed.
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  (async () => {
    await applySchema();
    await ensureSettings();
    await ensureAdminVoucher();
    const n = await seedQuestions();
    console.log(`Schema applied. Seeded ${n} questions. Total: ${await countQuestions()}.`);
    console.log(`Admin master voucher: ${config.adminVoucher}`);
    await pool.end();
  })().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
