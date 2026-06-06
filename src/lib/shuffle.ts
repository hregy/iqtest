// Fisher-Yates shuffle (returns a new array, does not mutate input).
export function shuffle<T>(input: readonly T[]): T[] {
  const arr = input.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Pick `count` random items from a pool with no repeats.
export function pickRandom<T>(pool: readonly T[], count: number): T[] {
  return shuffle(pool).slice(0, Math.min(count, pool.length));
}
