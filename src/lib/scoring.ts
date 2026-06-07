// Map a raw percentage to a light-hearted IQ-style number + band.
// This is a gamified estimate for a fast visual quiz, NOT a validated measure.
export function iqFromPercent(percent: number): number {
  // 0% -> ~70, 50% -> ~100, 100% -> ~145
  return Math.round(70 + (percent / 100) * 75);
}

export function bandForIq(iq: number): string {
  if (iq >= 130) return "Very Superior";
  if (iq >= 120) return "Superior";
  if (iq >= 110) return "High Average";
  if (iq >= 90) return "Average";
  if (iq >= 80) return "Low Average";
  return "Below Average";
}
