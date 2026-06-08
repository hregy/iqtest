// English overlay for the Final IQ bank. Reads an English version of the 300
// questions and writes English text onto the already-imported (Farsi) rows,
// matched by id. The answer keys (correct_index) and option ORDER are NOT
// touched — so the English file MUST keep the same `id`s, the same option order,
// and the same `answerOptionId` as the Farsi bank.
//
// Expected file: scripts/cognitive_test_bank_300_en.json (same shape as the
// Farsi bank). English text is read from, in order of preference:
//   prompt:      item.prompt_en | item.prompt | item.prompt_fa
//   option text: option.label_en | option.label
//
//   import { seedFinalBankEn }      -> can be called on boot
//   node server/seed-final-en.js   -> CLI overlay
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { pool, query } from "./db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CANDIDATES = [
  path.join(__dirname, "..", "scripts", "cognitive_test_bank_300_en.json"),
  path.join(__dirname, "..", "cognitive_test_bank_300_en.json"),
];

function findFile() {
  return CANDIDATES.find((p) => fs.existsSync(p)) || null;
}

export async function seedFinalBankEn() {
  const file = findFile();
  if (!file) {
    console.warn("cognitive_test_bank_300_en.json not found; skipping English overlay.");
    return { updated: 0, missing: 0 };
  }
  const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
  const items = Array.isArray(parsed) ? parsed : parsed.items;
  if (!Array.isArray(items) || !items.length) {
    console.warn("English bank has no items; skipping.");
    return { updated: 0, missing: 0 };
  }

  let updated = 0, missing = 0;
  for (const it of items) {
    const qr = await query("SELECT id FROM questions WHERE ext_id = $1 AND bank = 'final'", [it.id]);
    if (!qr.rows.length) { missing += 1; continue; }
    const qid = qr.rows[0].id;
    const enPrompt = (it.prompt_en ?? it.prompt ?? it.prompt_fa ?? "").toString();
    await query("UPDATE questions SET prompt = $1 WHERE id = $2", [enPrompt, qid]);
    const opts = Array.isArray(it.options) ? it.options : [];
    for (let i = 0; i < opts.length; i++) {
      const label = (opts[i]?.label_en ?? opts[i]?.label ?? "").toString();
      if (label) {
        await query(
          "UPDATE question_options SET text_value = $1 WHERE question_id = $2 AND idx = $3 AND kind = 'text'",
          [label, qid, i]
        );
      }
    }
    updated += 1;
  }
  return { updated, missing };
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  (async () => {
    const r = await seedFinalBankEn();
    console.log(`English overlay applied to ${r.updated} question(s).` + (r.missing ? ` ${r.missing} id(s) had no matching Farsi row.` : ""));
    await pool.end();
  })().catch((e) => { console.error(e); process.exit(1); });
}
