// Recalculate scores.correct_ms + scores.iq for EVERY row with the current
// canonical formula, so the whole scoreboard is consistent.
//   - rows that already have correct_ms: recompute iq from it (exact).
//   - older rows: approximate correct_ms from total duration (proportional to
//     accuracy); if duration is missing, assume full time (no speed bonus).
// Use:  node server/recalc.js   (CLI)   or   import { recalcScores }
import path from "path";
import { fileURLToPath } from "url";
import { pool, query } from "./db.js";
import { iqFromStored, iqWeighted } from "./routes/public.js";

export async function recalcScores() {
  const s = await query("SELECT value FROM settings WHERE key='question_seconds'");
  const globalQs = Number(s.rows[0]?.value || 10);

  const { rows } = await query("SELECT * FROM scores");
  for (const r of rows) {
    // Each row remembers the per-question seconds it ran with (final tests use a
    // different limit than classic); fall back to the global for legacy rows.
    const qs = Number(r.q_seconds) || globalQs;
    const L = qs * 1000;
    let correctMs = r.correct_ms;
    if (correctMs == null) {
      correctMs = r.duration_ms != null && r.total > 0
        ? Math.round((r.duration_ms * r.correct) / r.total)
        : r.correct * L;
    }
    correctMs = Math.max(0, Math.min(correctMs, r.correct * L));
    const iq = (r.test_type === "final" && r.total_weight)
      ? iqWeighted(r.correct_weight, r.total_weight, r.total, r.correct, correctMs, qs)
      : iqFromStored(r.correct, r.total, correctMs, qs);
    await query("UPDATE scores SET correct_ms=$1, iq=$2 WHERE id=$3", [correctMs, iq, r.id]);
  }
  return rows.length;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  recalcScores()
    .then((n) => { console.log(`Recalculated ${n} score(s).`); return pool.end(); })
    .catch((e) => { console.error(e); process.exit(1); });
}
