import { CLASSES } from "./layers";

/**
 * Upper bounds of the first four classes (five classes in all). `quantile` puts the same number of countries in each
 * class; `log` spaces the breaks evenly on a log scale, which suits population and area.
 */
export function breaks(
  values: readonly number[],
  scheme: "quantile" | "log",
  n = CLASSES,
): number[] {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (v.length === 0) return [];
  if (scheme === "log") {
    const pos = v.filter((x) => x > 0);
    const lo = Math.log(pos[0] as number);
    const hi = Math.log(pos[pos.length - 1] as number);
    return Array.from({ length: n - 1 }, (_, i) => Math.exp(lo + ((hi - lo) * (i + 1)) / n));
  }
  return Array.from(
    { length: n - 1 },
    (_, i) => v[Math.min(v.length - 1, Math.floor((v.length * (i + 1)) / n))] as number,
  );
}

/** The class (0 lowest) a value falls in: it is in class k when it is below break k. */
export function classOf(value: number, bounds: readonly number[]): number {
  for (let i = 0; i < bounds.length; i++) if (value < (bounds[i] as number)) return i;
  return bounds.length;
}

const compact = (v: number): string => {
  const a = Math.abs(v);
  if (a >= 1e9) return `${(v / 1e9).toFixed(a >= 1e10 ? 0 : 1)}B`;
  if (a >= 1e6) return `${(v / 1e6).toFixed(a >= 1e7 ? 0 : 1)}M`;
  if (a >= 1e4) return `${Math.round(v / 1e3)}k`;
  if (a >= 100) return String(Math.round(v));
  return String(Number(v.toFixed(a >= 10 ? 1 : 2)));
};

/** Legend labels, one per class: "< 10", "10 to 40", …, "≥ 300". Every class has a value label (atlas-explorer §10). */
export function legendLabels(bounds: readonly number[]): string[] {
  if (bounds.length === 0) return [];
  return [
    `< ${compact(bounds[0] as number)}`,
    ...bounds.slice(1).map((b, i) => `${compact(bounds[i] as number)} to ${compact(b)}`),
    `≥ ${compact(bounds[bounds.length - 1] as number)}`,
  ];
}
