import { readFileSync } from "node:fs";
import fc from "fast-check";
import { deflateSync } from "fflate";
import { describe, expect, it } from "vitest";
import {
  ChallengeError,
  DAY_MS,
  MAX_CODE_LENGTH,
  MIN_INTERVAL_MS,
  Rng,
  base64urlDecode,
  base64urlEncode,
  canonicalJSON,
  configHash,
  decodeChallenge,
  elapsedMs,
  encodeChallenge,
  formatShortCode,
  halfPoolWindow,
  inWarning,
  isSeed,
  isWeak,
  makeRng,
  newTimer,
  parseShortCode,
  pauseTimer,
  remainingMs,
  restoreTimer,
  seedFromBytes,
  selectNext,
  selectSequence,
  startTimer,
  updateMastery,
  type ChallengePayload,
  type RepeatRules,
} from "../src/index";

const golden = <T>(f: string): T =>
  JSON.parse(readFileSync(new URL(`./${f}`, import.meta.url), "utf8")) as T;

describe("PRNG", () => {
  type Row = {
    seed: string;
    game: string;
    config: unknown;
    label?: string;
    first20: number[];
    configHash: string;
  };
  const rows = golden<Row[]>("prng.golden.json");

  it("AC-PL-026 prng.golden.json has at least 10 rows", () =>
    expect(rows.length).toBeGreaterThanOrEqual(10));

  for (const [i, r] of rows.entries()) {
    it(`AC-PL-026 golden row ${i}: ${r.game}${r.label ? `/${r.label}` : ""}`, () => {
      let rng = makeRng(r.seed, r.game, r.config);
      if (r.label) rng = rng.fork(r.label);
      expect(Array.from({ length: 20 }, () => rng.nextUint32())).toEqual(r.first20);
      expect(configHash(r.config)).toBe(r.configHash);
    });
  }

  it("config hash ignores key order", () => {
    expect(configHash({ a: 1, b: { y: 2, x: 3 } })).toBe(configHash({ b: { x: 3, y: 2 }, a: 1 }));
    expect(configHash({ a: 1 })).not.toBe(configHash({ a: 2 }));
  });

  it("fork streams are independent of draws and of other forks", () => {
    const a = new Rng("k");
    const b = new Rng("k");
    for (let i = 0; i < 50; i++) a.nextUint32();
    b.fork("other").nextUint32();
    expect(Array.from({ length: 5 }, () => a.fork("items").nextUint32())).toEqual(
      Array.from({ length: 5 }, () => b.fork("items").nextUint32()),
    );
    expect(a.fork("x").nextUint32()).not.toBe(a.fork("y").nextUint32());
  });

  it("nextInt stays in range and rejects bad bounds", () => {
    const r = new Rng("range");
    for (let i = 0; i < 1000; i++) expect(r.nextInt(7)).toBeLessThan(7);
    expect(() => r.nextInt(0)).toThrow();
    expect(() => r.nextInt(1.5)).toThrow();
  });

  it("nextInt is unbiased enough (chi-square, 6 buckets)", () => {
    const r = new Rng("bias");
    const n = 60000;
    const c = new Array<number>(6).fill(0);
    for (let i = 0; i < n; i++) c[r.nextInt(6)]!++;
    const chi = c.reduce((sum, o) => sum + (o - n / 6) ** 2 / (n / 6), 0);
    expect(chi).toBeLessThan(20.5); // df = 5, p ≈ 0.001
  });

  it("shuffle is a deterministic permutation (property)", () => {
    fc.assert(
      fc.property(fc.array(fc.integer(), { maxLength: 60 }), fc.string(), (xs, key) => {
        const s1 = new Rng(key).shuffle(xs);
        const s2 = new Rng(key).shuffle(xs);
        expect(s1).toEqual(s2);
        expect([...s1].sort((p, q) => p - q)).toEqual([...xs].sort((p, q) => p - q));
      }),
    );
  });

  it("weightedIndex respects zero weights and proportions", () => {
    const r = new Rng("w");
    const counts = [0, 0, 0];
    for (let i = 0; i < 20000; i++) counts[r.weightedIndex([1, 0, 3])]!++;
    expect(counts[1]).toBe(0);
    expect(counts[2]! / counts[0]!).toBeGreaterThan(2.7);
    expect(counts[2]! / counts[0]!).toBeLessThan(3.3);
    expect(() => r.weightedIndex([0, 0])).toThrow();
  });
});

describe("seeds and base32", () => {
  it("seedFromBytes makes 10 Crockford characters", () => {
    const s = seedFromBytes(new Uint8Array([255, 255, 255, 255, 255, 255, 255]));
    expect(s).toBe("ZZZZZZZZZZ");
    expect(seedFromBytes(new Uint8Array(7))).toBe("0000000000");
    expect(isSeed(s)).toBe(true);
    expect(isSeed("K7Q2M9XD1")).toBe(false);
    expect(isSeed("K7Q2M9XD1U")).toBe(false); // U is not Crockford
  });
  it("any 7 random bytes give a valid seed (property)", () => {
    fc.assert(
      fc.property(fc.uint8Array({ minLength: 7, maxLength: 16 }), (b) => isSeed(seedFromBytes(b))),
    );
  });
});

describe("canonicalJSON", () => {
  it("sorts keys, drops undefined, rejects non-finite", () => {
    expect(canonicalJSON({ b: 1, a: [2, { d: 1, c: undefined }] })).toBe('{"a":[2,{"d":1}],"b":1}');
    expect(() => canonicalJSON({ a: Infinity })).toThrow();
  });
});

describe("Repeat Guard", () => {
  const pool = Array.from({ length: 197 }, (_, i) => `c${i}`);
  const rules: RepeatRules = { windowSize: halfPoolWindow, relax: "halve-window" };

  it("AC-SH-012 98 consecutive picks on a 197 pool are distinct", () => {
    const rng = new Rng("guard");
    expect(halfPoolWindow(197)).toBe(98);
    const { ids, guardRelaxed } = selectSequence(pool, 98, [], rng, rules);
    expect(new Set(ids).size).toBe(98);
    expect(guardRelaxed).toBe(false);
  });

  it("AC-SH-013 extra window keeps small entities 7 apart over 1000 picks", () => {
    const small = (id: string): boolean => Number(id.slice(1)) < 20;
    const r: RepeatRules = { ...rules, extraWindows: [{ predicate: small, size: 7 }] };
    const rng = new Rng("small");
    const { ids } = selectSequence(pool, 1000, [], rng, r);
    for (let i = 0; i < ids.length; i++) {
      if (!small(ids[i] as string)) continue;
      const window = ids.slice(Math.max(0, i - 6), i);
      expect(window).not.toContain(ids[i]);
    }
  });

  it("down-weights the same group as the previous pick", () => {
    const group = (id: string): number => Number(id.slice(1)) % 2;
    const r: RepeatRules = {
      windowSize: 0,
      relax: "halve-window",
      downWeight: [{ predicate: (id, prev) => group(id) === group(prev), factor: 0.3 }],
    };
    const rng = new Rng("dw");
    let same = 0;
    let h: readonly string[] = ["c0"];
    for (let i = 0; i < 4000; i++) {
      const s = selectNext(pool, h, rng, r);
      if (group(s.id) === group(h[h.length - 1] as string)) same++;
      h = s.history;
    }
    // Expected same-group share = 0.3 / (0.3 + 1) ≈ 0.23.
    expect(same / 4000).toBeGreaterThan(0.19);
    expect(same / 4000).toBeLessThan(0.27);
  });

  it("never fails: halve-window relaxes and flags it", () => {
    const tiny = ["a", "b", "c", "d"];
    const rng = new Rng("tiny");
    const r: RepeatRules = { windowSize: 100, relax: "halve-window" };
    const { ids, guardRelaxed } = selectSequence(tiny, 25, [], rng, r);
    expect(ids).toHaveLength(25);
    expect(guardRelaxed).toBe(true);
    expect(selectNext(["x"], ["x"], rng, r).id).toBe("x");
  });

  it("never fails: reset-oldest-half relaxes and trims history", () => {
    const tiny = ["a", "b", "c", "d"];
    const r: RepeatRules = { windowSize: 4, relax: "reset-oldest-half" };
    const s = selectNext(tiny, ["a", "b", "c", "d"], new Rng("r"), r);
    expect(s.guardRelaxed).toBe(true);
    expect(["a", "b"]).toContain(s.id); // the oldest half was forgotten
  });

  it("history is capped at 500", () => {
    let h: readonly string[] = [];
    const rng = new Rng("cap");
    for (let i = 0; i < 600; i++)
      h = selectNext(pool, h, rng, { windowSize: 0, relax: "halve-window" }).history;
    expect(h).toHaveLength(500);
  });

  it("seeded sequences are identical for everyone and ignore personal history", () => {
    const a = selectSequence(pool, 20, [], makeRng("K7Q2M9XD1A", "silhouette", {}), rules).ids;
    const b = selectSequence(pool, 20, [], makeRng("K7Q2M9XD1A", "silhouette", {}), rules).ids;
    expect(a).toEqual(b);
  });

  it("throws on an empty pool", () => {
    expect(() => selectNext([], [], new Rng("e"), rules)).toThrow();
  });
});

describe("timer", () => {
  it("accumulates active time across pauses", () => {
    let t = startTimer(newTimer(), 1000);
    expect(elapsedMs(t, 1500)).toBe(500);
    t = pauseTimer(t, 2000);
    expect(elapsedMs(t, 9999)).toBe(1000); // paused: time passing does not count
    t = startTimer(t, 10000);
    expect(elapsedMs(t, 10250)).toBe(1250);
  });
  it("start and pause are idempotent; a backwards clock never subtracts", () => {
    const t = startTimer(newTimer(), 100);
    expect(startTimer(t, 500)).toBe(t);
    const p = pauseTimer(t, 90);
    expect(p.elapsedMs).toBe(0);
    expect(pauseTimer(p, 200)).toBe(p);
  });
  it("countdown and warning (10% of the limit, minimum 10 s)", () => {
    const t = startTimer(newTimer(), 0);
    expect(remainingMs(t, 100_000, 120_000)).toBe(20_000);
    expect(inWarning(t, 100_000, 120_000)).toBe(false);
    expect(inWarning(t, 108_000, 120_000)).toBe(true); // 12 s left = 10%
    expect(inWarning(t, 25_000, 30_000)).toBe(true); // 5 s left
    expect(remainingMs(t, 500_000, 120_000)).toBe(0);
  });
  it("a reloaded timer comes back paused", () => {
    expect(restoreTimer({ elapsedMs: 4200 })).toEqual({ elapsedMs: 4200, runningSince: null });
  });
});

describe("mastery", () => {
  it("initial exposure from 0.5 with a correct answer", () => {
    const m = updateMastery(undefined, { itemScore: 1, correct: true }, 1000);
    expect(m.mastery).toBeCloseTo(0.65, 10);
    expect(m.exposures).toBe(1);
    expect(m.dueAt - m.lastSeenAt).toBe(DAY_MS);
  });
  it("interval doubles 1d, 2d, 4d … capped at 60d, and resets to 10 min on a miss", () => {
    let m = updateMastery(undefined, { itemScore: 1, correct: true }, 0);
    const days: number[] = [1];
    for (let i = 0; i < 8; i++) {
      m = updateMastery(m, { itemScore: 1, correct: true }, m.dueAt);
      days.push((m.dueAt - m.lastSeenAt) / DAY_MS);
    }
    expect(days).toEqual([1, 2, 4, 8, 16, 32, 60, 60, 60]);
    m = updateMastery(m, { itemScore: 0, correct: false }, m.dueAt);
    expect(m.dueAt - m.lastSeenAt).toBe(MIN_INTERVAL_MS);
    m = updateMastery(m, { itemScore: 1, correct: true }, m.dueAt);
    expect(m.dueAt - m.lastSeenAt).toBe(DAY_MS); // restarts the ladder
  });
  it("mastery stays in [0, 1] and flags weak items (property)", () => {
    fc.assert(
      fc.property(
        fc.array(fc.double({ min: -1, max: 2, noNaN: true }), { minLength: 1, maxLength: 30 }),
        (scores) => {
          let m = undefined as ReturnType<typeof updateMastery> | undefined;
          for (const s of scores) m = updateMastery(m, { itemScore: s, correct: s > 0.5 }, 0);
          expect(m!.mastery).toBeGreaterThanOrEqual(0);
          expect(m!.mastery).toBeLessThanOrEqual(1);
        },
      ),
    );
    expect(isWeak(updateMastery(undefined, { itemScore: 0, correct: false }, 0))).toBe(true); // 0.35
    expect(isWeak(updateMastery(undefined, { itemScore: 1, correct: true }, 0))).toBe(false); // 0.65
  });
});

describe("challenge codes", () => {
  type Row = { canonical: string; code: string };
  const rows = golden<Row[]>("challenge-codes.golden.json");

  it("golden table has at least 20 rows", () => expect(rows.length).toBeGreaterThanOrEqual(20));

  for (const [i, r] of rows.entries()) {
    it(`AC-PL-015 golden row ${i}: payload ↔ code`, () => {
      const payload = decodeChallenge(r.code);
      expect(canonicalJSON(payload)).toBe(r.canonical);
      expect(encodeChallenge(payload)).toBe(r.code);
    });
  }

  it("round-trips arbitrary payloads (property)", () => {
    const payload = fc.record({
      v: fc.constant(1 as const),
      g: fc.constantFrom("quiz", "silhouette", "fact-pin"),
      c: fc.dictionary(
        fc.string({ maxLength: 4 }),
        fc.oneof(fc.integer(), fc.string({ maxLength: 12 }), fc.boolean()),
      ),
      s: fc.constantFrom("K7Q2M9XD1A", "0000000000"),
      cv: fc.constant("2026.11.0"),
    });
    fc.assert(
      fc.property(payload, (p) => {
        expect(
          JSON.parse(canonicalJSON(decodeChallenge(encodeChallenge(p as ChallengePayload)))),
        ).toEqual(JSON.parse(canonicalJSON(p)));
      }),
    );
  });

  it("base64url round-trips every length", () => {
    fc.assert(
      fc.property(fc.uint8Array({ maxLength: 40 }), (b) => {
        expect(base64urlDecode(base64urlEncode(b))).toEqual(b);
      }),
    );
    expect(base64urlEncode(new Uint8Array([251, 255, 254]))).toBe("-__-");
  });

  it("decoder hardening: too long, bomb, garbage, wrong version, missing fields", () => {
    const err = (f: () => unknown): string => {
      try {
        f();
      } catch (e) {
        if (e instanceof ChallengeError) return e.code;
        throw e;
      }
      return "no error";
    };
    expect(err(() => decodeChallenge("A".repeat(MAX_CODE_LENGTH + 1)))).toBe("too_long");
    const bomb = base64urlEncode(
      deflateSync(new TextEncoder().encode(`{"v":1,"pad":"${"a".repeat(200_000)}"}`)),
    );
    expect(bomb.length).toBeLessThan(MAX_CODE_LENGTH);
    expect(err(() => decodeChallenge(bomb))).toBe("too_large");
    expect(err(() => decodeChallenge("!!!not-a-code"))).toBe("malformed");
    expect(err(() => decodeChallenge("AAAA"))).toBe("malformed");
    const enc = (o: unknown): string =>
      base64urlEncode(deflateSync(new TextEncoder().encode(JSON.stringify(o))));
    expect(
      err(() => decodeChallenge(enc({ v: 2, g: "quiz", c: {}, s: "K7Q2M9XD1A", cv: "x" }))),
    ).toBe("unsupported_version");
    expect(err(() => decodeChallenge(enc({ v: 1, g: "quiz" })))).toBe("malformed");
    expect(err(() => decodeChallenge(enc([1, 2])))).toBe("unsupported_version");
  });

  it("short codes: format, lenient parsing, rejection", () => {
    const code = formatShortCode("SH", new Uint8Array([0x25, 0x4f, 0x15, 0x6c, 0x6d]));
    expect(code).toMatch(/^SH-[0-9A-Z]{4}-[0-9A-Z]{4}$/);
    expect(parseShortCode(code)).toBe(code);
    expect(parseShortCode("sh 4kq2 m9xd")).toBe("SH-4KQ2-M9XD");
    expect(parseShortCode("SH-4KQ2-M9XU")).toBeNull(); // U is invalid
    expect(parseShortCode("SH-OIL0-OIL0")).toBe("SH-0110-0110");
    expect(parseShortCode("nope")).toBeNull();
  });
});
