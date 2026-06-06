import type { Answer, Category } from "../types";
import { TEST_LENGTH } from "../config";

export interface Score {
  correct: number;
  total: number;
  percent: number;
  iq: number;            // playful IQ-style estimate (NOT a clinical score)
  band: string;
  byCategory: Record<Category, { correct: number; total: number }>;
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

  const byCategory = {
    numeric: { correct: 0, total: 0 },
    verbal: { correct: 0, total: 0 },
    spatial: { correct: 0, total: 0 },
  } as Record<Category, { correct: number; total: number }>;

  for (const a of answers) {
    byCategory[a.category].total += 1;
    if (a.correct) byCategory[a.category].correct += 1;
  }

  return { correct, total, percent, iq, band: bandFor(iq), byCategory };
}
