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
  const defaults = {
    test_length: "20",
    question_seconds: "10",
    // Final IQ test: 6 questions per level × 5 levels = 30, with their own time limit.
    final_per_level: "6",
    final_question_seconds: "30",
    // "1" = a voucher code is required to start a test (current behaviour);
    // "0" = open access, anyone can take a test with just a name.
    voucher_required: "1",
  };
  for (const [k, v] of Object.entries(defaults)) {
    await query("INSERT INTO settings(key, value) VALUES($1,$2) ON CONFLICT (key) DO NOTHING", [k, v]);
  }
}

async function ensureAdminVoucher() {
  await query(
    `INSERT INTO vouchers(code, type, max_uses, note) VALUES($1,'admin',0,'Master / practice')
     ON CONFLICT (code) DO UPDATE SET type='admin', used=false, expires_at=NULL, max_uses=0`,
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
        `INSERT INTO questions(ext_id, type, category, prompt, prompt_fa, correct_index, puzzle_image_id)
         VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
        [q.ext_id, q.type, q.category, q.prompt, q.prompt_fa || "", q.correctIndex, puzzleId]
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

async function countFinal() {
  const { rows } = await query("SELECT count(*)::int AS c FROM questions WHERE bank='final'");
  return rows[0].c;
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
  // Load the 300-item Final bank if it's present on disk but missing or only
  // PARTIALLY imported (e.g. a prior seed was interrupted). Re-seeding when the
  // DB count doesn't match the file means an incomplete bank self-heals on boot.
  if (seedIfEmpty) {
    try {
      const { seedFinalBank, finalBankFileCount } = await import("./seed-final.js");
      const expected = finalBankFileCount();
      if (expected > 0 && (await countFinal()) !== expected) {
        const n = await seedFinalBank();
        if (n) console.log(`Seeded ${n} final-bank questions on boot.`);
      }
    } catch (e) {
      console.warn("Final bank not seeded:", e.message);
    }
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
