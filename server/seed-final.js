// Importer for the Final IQ test bank — 300 questions in 5 difficulty levels
// (cognitive_test_bank_300_fa.json). Visual puzzles/options are inline SVG and
// are stored as image/svg+xml blobs (reusing /api/images + the <img> renderer);
// text options are stored as kind='text'. Tagged bank='final', level 1..5.
//   import { seedFinalBank }   -> called by boot init if the bank is empty
//   node server/seed-final.js  -> CLI: (re)load the whole final bank
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { pool, query, withTx } from "./db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Look for the bank in scripts/ (preferred) or the repo root.
const CANDIDATES = [
  path.join(__dirname, "..", "scripts", "cognitive_test_bank_300_fa.json"),
  path.join(__dirname, "..", "cognitive_test_bank_300_fa.json"),
];

// Per-level scoring weight (harder levels count more). Falls back to the item's
// own scoringWeight if present.
const LEVEL_WEIGHT = { 1: 1.0, 2: 1.2, 3: 1.5, 4: 1.8, 5: 2.2 };
const OPT_INDEX = { A: 0, B: 1, C: 2, D: 3 };

function findBankFile() {
  return CANDIDATES.find((p) => fs.existsSync(p)) || null;
}

async function insertSvg(client, svg) {
  const { rows } = await client.query(
    "INSERT INTO images(mime, data) VALUES($1,$2) RETURNING id",
    ["image/svg+xml", Buffer.from(String(svg), "utf8")]
  );
  return rows[0].id;
}

// Remove the previously-imported final bank (questions + their images).
async function wipeFinal(client) {
  const { rows: old } = await client.query("SELECT id, puzzle_image_id FROM questions WHERE bank='final'");
  for (const q of old) {
    const opts = await client.query("SELECT image_id FROM question_options WHERE question_id=$1", [q.id]);
    await client.query("DELETE FROM questions WHERE id=$1", [q.id]);
    const imgIds = [q.puzzle_image_id, ...opts.rows.map((o) => o.image_id)].filter(Boolean);
    if (imgIds.length) await client.query("DELETE FROM images WHERE id = ANY($1)", [imgIds]);
  }
}

// Number of items in the bank file (0 if the file is missing/empty). Used by
// boot init to detect an incomplete bank that must be (re)seeded.
export function finalBankFileCount() {
  const file = findBankFile();
  if (!file) return 0;
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    const items = Array.isArray(parsed) ? parsed : parsed.items;
    return Array.isArray(items) ? items.length : 0;
  } catch {
    return 0;
  }
}

export async function seedFinalBank() {
  const file = findBankFile();
  if (!file) {
    console.warn("cognitive_test_bank_300_fa.json not found; skipping final-bank seed.");
    return 0;
  }
  const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
  const items = Array.isArray(parsed) ? parsed : parsed.items;
  if (!Array.isArray(items) || !items.length) {
    console.warn("Final bank has no items; skipping.");
    return 0;
  }

  // Whole import runs in ONE transaction: a partial bank is never visible to a
  // running test (readers see the old state until commit, then all 300 at once).
  // This is what prevents the "only some levels seeded -> short test" race.
  let imported = 0;
  await withTx(async (client) => {
    await wipeFinal(client);
    for (const it of items) {
      const correctIndex = OPT_INDEX[it.answerOptionId];
      if (correctIndex === undefined || !Array.isArray(it.options) || it.options.length !== 4) {
        console.warn(`Skipping ${it.id}: bad answer/options.`);
        continue;
      }
      const level = Number(it.level) || 1;
      const weight = LEVEL_WEIGHT[level] ?? Number(it.scoringWeight) ?? 1;

      const puzzleId = it.questionSvg ? await insertSvg(client, it.questionSvg) : null;
      const { rows } = await client.query(
        `INSERT INTO questions(ext_id, type, category, prompt, prompt_fa, correct_index,
                               puzzle_image_id, bank, level, weight, active)
         VALUES($1,$2,$3,'',$4,$5,$6,'final',$7,$8,true) RETURNING id`,
        [it.id, it.type || it.subtype || "final", it.domain || "final",
         it.prompt_fa || "", correctIndex, puzzleId, level, weight]
      );
      const qid = rows[0].id;
      for (let i = 0; i < 4; i++) {
        const o = it.options[i];
        if (o.svg) {
          const imgId = await insertSvg(client, o.svg);
          await client.query(
            "INSERT INTO question_options(question_id, idx, kind, image_id) VALUES($1,$2,'image',$3)",
            [qid, i, imgId]
          );
        } else {
          // Farsi label goes in both columns; the English importer overwrites
          // text_value later, so English mode shows Farsi until that runs.
          const label = String(o.label ?? "");
          await client.query(
            "INSERT INTO question_options(question_id, idx, kind, text_value, text_value_fa) VALUES($1,$2,'text',$3,$3)",
            [qid, i, label]
          );
        }
      }
      imported += 1;
    }
  });
  return imported;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  (async () => {
    const n = await seedFinalBank();
    const { rows } = await query(
      "SELECT level, count(*)::int c FROM questions WHERE bank='final' GROUP BY level ORDER BY level"
    );
    console.log(`Imported ${n} final-bank questions. Per level: ${rows.map((r) => `L${r.level}:${r.c}`).join("  ") || "(none)"}`);
    await pool.end();
  })().catch((e) => { console.error(e); process.exit(1); });
}
