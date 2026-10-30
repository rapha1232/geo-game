/**
 * Damerau–Levenshtein distance (optimal string alignment: insert, delete, substitute and adjacent transposition),
 * with early exit. Returns `cutoff + 1` as soon as the distance is known to exceed `cutoff`.
 */
export function boundedDistance(a: string, b: string, cutoff: number): number {
  const n = a.length;
  const m = b.length;
  if (Math.abs(n - m) > cutoff) return cutoff + 1;
  if (n === 0) return m;
  if (m === 0) return n;
  let prev2: number[] = [];
  let prev = Array.from({ length: m + 1 }, (_, j) => j);
  for (let i = 1; i <= n; i++) {
    const cur = new Array<number>(m + 1);
    cur[0] = i;
    let rowMin = i;
    for (let j = 1; j <= m; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      let v = Math.min(
        (prev[j] as number) + 1,
        (cur[j - 1] as number) + 1,
        (prev[j - 1] as number) + cost,
      );
      if (
        i > 1 &&
        j > 1 &&
        a.charCodeAt(i - 1) === b.charCodeAt(j - 2) &&
        a.charCodeAt(i - 2) === b.charCodeAt(j - 1)
      ) {
        v = Math.min(v, (prev2[j - 2] as number) + 1);
      }
      cur[j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > cutoff) return cutoff + 1;
    prev2 = prev;
    prev = cur;
  }
  return Math.min(prev[m] as number, cutoff + 1);
}
