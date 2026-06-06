import type { Answer } from "../types";
import { TEST_LENGTH } from "../config";

export interface Score {
  correct: number;
  total: number;
  percent: number;
  iq: number;            // playful IQ-style estimate (NOT a clinical score)
  band: string;
  byCategory: Record<string, { correct: number; total: number }>;
}

// Map raw percentage to a light-hearted IQ-style number.
// This is a gamified estimate for a 10-second-per-question quiz, NOT a
// validated psychometric measure.
function toIq(percent: number): number {
  // 0% -> ~70, 50% -> ~100, 100% -> ~145
  return Math.round(70 + (percent / 100) * 75);
}

function bandFor(iq: number): string {
  if (iq >= 130) return "Very Superior";
  if (iq >= 120) return "Superior";
  if (iq >= 110) return "High Average";
  if (iq >= 90) return "Average";
  if (iq >= 80) return "Low Average";
  return "Below Average";
}

export function computeScore(answers: Answer[]): Score {
  const correct = answers.filter((a) => a.correct).length;
  const total = answers.length || TEST_LENGTH;
  const percent = Math.round((correct / total) * 100);
  const iq = toIq(percent);

  // Built dynamically from whatever categories appear in this attempt.
  const byCategory: Record<string, { correct: number; total: number }> = {};
  for (const a of answers) {
    const entry = (byCategory[a.category] ??= { correct: 0, total: 0 });
    entry.total += 1;
    if (a.correct) entry.correct += 1;
  }

  return { correct, total, percent, iq, band: bandFor(iq), byCategory };
}
