import { canonicalJSON } from "./canonical";

/**
 * Deterministic PRNG (ARCHITECTURE §8.1). 32-bit integer math only, no Math.random.
 * cyrb128 → sfc32, with 15 warm-up rounds.
 */

export function cyrb128(str: string): [number, number, number, number] {
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;
  for (let i = 0; i < str.length; i++) {
    const k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4;
  h2 ^= h1;
  h3 ^= h1;
  h4 ^= h1;
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}

/** Stable config hash: canonical JSON → cyrb128 → first word as 8 hex characters. */
export function configHash(config: unknown): string {
  const [h1] = cyrb128(canonicalJSON(config));
  return h1.toString(16).padStart(8, "0");
}

const WARMUP = 15;

export class Rng {
  private a: number;
  private b: number;
  private c: number;
  private d: number;

  /** `key` is the string the stream was derived from; forks hash it with a label. */
  constructor(readonly key: string) {
    [this.a, this.b, this.c, this.d] = cyrb128(key) as [number, number, number, number];
    for (let i = 0; i < WARMUP; i++) this.nextUint32();
  }

  nextUint32(): number {
    const t = (((this.a + this.b) | 0) + this.d) | 0;
    this.d = (this.d + 1) | 0;
    this.a = this.b ^ (this.b >>> 9);
    this.b = (this.c + (this.c << 3)) | 0;
    this.c = (this.c << 21) | (this.c >>> 11);
    this.c = (this.c + t) | 0;
    return t >>> 0;
  }

  /** Float in [0, 1) with 32 bits of resolution. */
  nextFloat(): number {
    return this.nextUint32() / 4294967296;
  }

  /** Uniform integer in [0, n) by rejection sampling (no modulo bias). */
  nextInt(n: number): number {
    if (!Number.isInteger(n) || n <= 0 || n > 4294967296) throw new RangeError(`nextInt(${n})`);
    const limit = 4294967296 - (4294967296 % n);
    let x = this.nextUint32();
    while (x >= limit) x = this.nextUint32();
    return x % n;
  }

  /** Independent sub-stream. Depends only on this stream's key and the label, never on draws so far. */
  fork(label: string): Rng {
    return new Rng(`${this.key}/${label}`);
  }

  /** Fisher–Yates, returning a new array. */
  shuffle<T>(items: readonly T[]): T[] {
    const a = items.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = this.nextInt(i + 1);
      [a[i], a[j]] = [a[j] as T, a[i] as T];
    }
    return a;
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new RangeError("pick from empty array");
    return items[this.nextInt(items.length)] as T;
  }

  /** Index chosen with probability proportional to `weights` (non-negative, not all zero). */
  weightedIndex(weights: readonly number[]): number {
    let total = 0;
    for (const w of weights) total += w;
    if (!(total > 0)) throw new RangeError("weightedIndex: no positive weight");
    const target = this.nextFloat() * total;
    let acc = 0;
    let last = -1;
    for (let i = 0; i < weights.length; i++) {
      const w = weights[i] as number;
      if (w <= 0) continue;
      acc += w;
      last = i;
      if (target < acc) return i;
    }
    return last;
  }
}

/** Root stream for a puzzle: `seed|gameId|configHash` (ARCHITECTURE §8.1). */
export function makeRng(seed: string, gameId: string, config: unknown): Rng {
  return new Rng(`${seed}|${gameId}|${configHash(config)}`);
}
