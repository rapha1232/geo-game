import { TIERS, type Calibration, type Prompt, type Tier } from "./types";

/** The weight telemetry gets in the blend: `min(1, n / 300)` (AC-DC-008). */
export const blendWeight = (n: number): number => Math.min(1, Math.max(0, n) / 300);

/**
 * Blended obviousness `b = w × f_norm + (1 − w) × o` per answer. Without telemetry, or with none for this prompt, `b` is
 * the prior alone.
 */
export function blended(prompt: Prompt, calibration?: Calibration): Map<string, number> {
  const w = calibration ? blendWeight(calibration.n) : 0;
  const maxPick = calibration
    ? Math.max(0, ...prompt.answers.map((a) => calibration.picks[a] ?? 0))
    : 0;
  return new Map(
    prompt.answers.map((a) => {
      const o = prompt.rarity_prior[a] ?? 0.5;
      const fNorm = maxPick > 0 && calibration ? (calibration.picks[a] ?? 0) / maxPick : 0;
      return [a, w * fNorm + (1 - w) * o] as const;
    }),
  );
}

/**
 * Cumulative cut points `c_i = round(k × 0.2 × i)` for i = 1 to 4, with `c_1` at least 1 (deep-cut §6.2). So every prompt
 * has at least one Deep Cut answer, and a band can be empty.
 */
export function cutPoints(k: number): [number, number, number, number] {
  const c = [1, 2, 3, 4].map((i) => Math.round(k * 0.2 * i));
  c[0] = Math.max(1, c[0] as number);
  return c as [number, number, number, number];
}

/** The tier of every answer: least obvious first, ties broken by id (AC-DC-001, AC-DC-002). */
export function assignTiers(prompt: Prompt, calibration?: Calibration): Map<string, Tier> {
  const b = blended(prompt, calibration);
  const order = [...prompt.answers].sort(
    (x, y) => (b.get(x) as number) - (b.get(y) as number) || x.localeCompare(y),
  );
  const cuts = cutPoints(order.length);
  return new Map(
    order.map((id, i) => {
      const band = cuts.findIndex((c) => i < c);
      return [id, TIERS[band === -1 ? 4 : band] as Tier] as const;
    }),
  );
}

/** Answers grouped by tier, rarest tier first, for the reveal. */
export function byTier(tiers: ReadonlyMap<string, Tier>): Record<Tier, string[]> {
  const out = Object.fromEntries(TIERS.map((t) => [t, [] as string[]])) as Record<Tier, string[]>;
  for (const [id, tier] of [...tiers].sort(([a], [b]) => a.localeCompare(b))) out[tier].push(id);
  return out;
}
