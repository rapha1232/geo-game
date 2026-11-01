import { describe, expect, it } from "vitest";
import { makeRng } from "@meridian/game-kit";
import {
  MAX_RUN_POINTS,
  advance,
  answerCount,
  assignTiers,
  blendWeight,
  byTier,
  composeRun,
  cutPoints,
  lock,
  oneSolid,
  provisional,
  select,
  startRun,
  total,
  type Prompt,
  type PromptSource,
} from "../src";

const portuguese: Prompt = {
  id: "prompt:lang-portuguese",
  family: "language",
  text: "Portuguese is an official language",
  answers: [
    "country:PRT",
    "country:BRA",
    "country:AGO",
    "country:MOZ",
    "country:CPV",
    "country:GNB",
    "country:STP",
    "country:TLS",
    "country:GNQ",
  ],
  explanation: "Official status per national constitutions.",
  invalid: "{name}: Portuguese is not an official language.",
  rarity_prior: {
    "country:BRA": 0.95,
    "country:PRT": 0.92,
    "country:AGO": 0.55,
    "country:MOZ": 0.52,
    "country:CPV": 0.3,
    "country:GNB": 0.22,
    "country:TLS": 0.18,
    "country:STP": 0.15,
    "country:GNQ": 0.06,
  },
};
const id = (iso: string) => `country:${iso}`;
const names: Record<string, string> = {
  "country:ESP": "Spain",
  "country:AGO": "Angola",
  "country:TLS": "Timor-Leste",
};
const nameOf = (x: string) => names[x] ?? x;
const source = (
  prompts: Prompt[],
  cal?: Record<string, { n: number; picks: Record<string, number> }>,
): PromptSource => ({
  prompt: (i) => prompts.find((p) => p.id === i),
  ...(cal ? { calibration: (i: string) => cal[i] } : {}),
});

describe("rarity tiers (deep-cut §6.2)", () => {
  it("AC-DC-001 the 9-answer Portuguese example gives exactly the documented tiers", () => {
    const g = byTier(assignTiers(portuguese));
    expect(g["deep-cut"].sort()).toEqual([id("GNQ"), id("STP")]);
    expect(g.deep.sort()).toEqual([id("GNB"), id("TLS")]);
    expect(g.sharp).toEqual([id("CPV")]);
    expect(g.solid.sort()).toEqual([id("AGO"), id("MOZ")]);
    expect(g.obvious.sort()).toEqual([id("BRA"), id("PRT")]);
  });

  it("cut points follow round(k × 0.2 × i) with the first at least 1", () => {
    expect(cutPoints(9)).toEqual([2, 4, 5, 7]);
    expect(cutPoints(4)).toEqual([1, 2, 2, 3]);
    expect(cutPoints(5)[0]).toBe(1);
  });

  it("AC-DC-002 every prompt with 4 to 30 answers has at least one Deep Cut, and an empty band is allowed", () => {
    for (let k = 4; k <= 30; k++) {
      const p: Prompt = {
        ...portuguese,
        answers: Array.from({ length: k }, (_, i) => `country:A${String(i).padStart(2, "0")}`),
        rarity_prior: {},
      };
      const g = byTier(assignTiers(p));
      expect(g["deep-cut"].length).toBeGreaterThanOrEqual(1);
      expect(Object.values(g).flat()).toHaveLength(k);
    }
    const four = byTier(assignTiers({ ...portuguese, answers: portuguese.answers.slice(0, 4) }));
    expect(four.sharp).toHaveLength(0);
  });

  it("breaks ties by entity id", () => {
    const p: Prompt = {
      ...portuguese,
      answers: ["country:ZZZ", "country:AAA", "country:MMM", "country:BBB"],
      rarity_prior: {
        "country:ZZZ": 0.5,
        "country:AAA": 0.5,
        "country:MMM": 0.5,
        "country:BBB": 0.5,
      },
    };
    expect(assignTiers(p).get("country:AAA")).toBe("deep-cut");
  });

  it("AC-DC-008 telemetry weight is n / 300, capped at 1", () => {
    expect(blendWeight(150)).toBe(0.5);
    expect(blendWeight(0)).toBe(0);
    expect(blendWeight(900)).toBe(1);
  });

  it("with enough telemetry, a heavily picked answer becomes Obvious whatever the prior says", () => {
    const calibration = { n: 600, picks: { "country:GNQ": 500, "country:BRA": 10 } };
    const t = assignTiers(portuguese, calibration);
    expect(t.get("country:GNQ")).toBe("obvious");
    expect(t.get("country:PRT")).not.toBe("obvious");
  });
});

describe("playing a run", () => {
  const src = source([portuguese]);
  const start = () => startRun(src, [portuguese.id], "run", 60);

  it("AC-DC-003 Timor-Leste on the example scores 700", () => {
    const r = lock(select(start(), id("TLS")), src, nameOf);
    expect(r.valid).toBe(true);
    expect(r.tier).toBe("deep");
    expect(total(r.state)).toBe(700);
  });

  it("AC-DC-004 Spain on the Portuguese prompt scores 0 and says why", () => {
    const r = lock(select(start(), id("ESP")), src, nameOf);
    expect(r.valid).toBe(false);
    expect(r.points).toBe(0);
    expect(r.message).toBe("Spain: Portuguese is not an official language.");
  });

  it("AC-DC-005 a timeout with a selection locks it: Angola scores 250", () => {
    const r = lock(select(start(), id("AGO")), src, nameOf, { timedOut: true });
    expect(r.state.prompts[0]).toMatchObject({ answer: id("AGO"), points: 250, timedOut: true });
  });

  it("AC-DC-006 a timeout without a selection scores 0 and still reveals", () => {
    const r = lock(start(), src, nameOf, { timedOut: true });
    expect(r.points).toBe(0);
    expect(r.state.prompts[0]?.locked).toBe(true);
    expect(r.message).toBeNull();
  });

  it("the selection can change until it is locked, and not after", () => {
    let s = select(select(start(), id("AGO")), id("MOZ"));
    expect(s.prompts[0]?.selection).toBe(id("MOZ"));
    s = lock(s, src, nameOf).state;
    expect(select(s, id("BRA")).prompts[0]?.selection).toBe(id("MOZ"));
    expect(lock(s, src, nameOf).state).toBe(s);
  });

  it("AC-DC-012 the stored tiers do not change when the prompt is recalibrated later", () => {
    const s = start();
    const later = source([portuguese], {
      [portuguese.id]: { n: 900, picks: { "country:GNQ": 900 } },
    });
    const locked = lock(select(s, id("GNQ")), later, nameOf).state;
    expect(locked.prompts[0]?.tier).toBe("deep-cut");
    expect(locked.prompts[0]?.points).toBe(1000);
  });

  it("AC-DC-013 a run on the prior alone is flagged provisional", () => {
    expect(provisional(start())).toBe(true);
    const calibrated = startRun(
      source([portuguese], { [portuguese.id]: { n: 10, picks: {} } }),
      [portuguese.id],
      "run",
      60,
    );
    expect(provisional(calibrated)).toBe(false);
  });

  it("AC-DC-014 the same country can answer two prompts in a run", () => {
    const brazil2: Prompt = {
      ...portuguese,
      id: "prompt:lang-other",
      family: "other",
      answers: [...portuguese.answers.slice(0, 3), id("TLS")],
      rarity_prior: { [id("PRT")]: 0.9, [id("BRA")]: 0.95, [id("AGO")]: 0.5, [id("TLS")]: 0.2 },
    };
    const s2 = source([portuguese, brazil2]);
    let s = startRun(s2, [portuguese.id, brazil2.id], "run", 60);
    s = advance(lock(select(s, id("BRA")), s2, nameOf).state);
    s = lock(select(s, id("BRA")), s2, nameOf).state;
    expect(s.prompts.map((p) => p.points)).toEqual([100, 100]);
    expect(advance(s).status).toBe("done");
  });

  it("scores nothing in Practice, shows the count and offers one Solid answer", () => {
    const p = startRun(src, [portuguese.id], "practice", 60);
    expect(p.timer).toBe(0);
    expect(answerCount(src, portuguese.id)).toBe(9);
    expect(["country:AGO", "country:MOZ"]).toContain(oneSolid(p));
    const r = lock(select(p, id("GNQ")), src, nameOf);
    expect(r.tier).toBe("deep-cut");
    expect(total(r.state)).toBe(0);
  });

  it("a run maximum is 5,000", () => {
    expect(MAX_RUN_POINTS).toBe(5000);
  });
});

describe("composing a run", () => {
  const families = ["language", "neighbors", "lines", "names", "rankings", "two-attribute"];
  const pool: Prompt[] = Array.from({ length: 80 }, (_, i) => ({
    ...portuguese,
    id: `prompt:${i}`,
    family: families[i % families.length] as string,
    answers: Array.from({ length: 4 + (i % 20) }, (_, k) => `country:X${i}_${k}`),
    rarity_prior: {},
  }));

  it("AC-DC-010 gives five prompts from five different families, with a mean breadth of 8 to 20 where possible", () => {
    for (let i = 0; i < 30; i++) {
      const { ids } = composeRun(pool, [], makeRng("RUNSEED001", "deep-cut", i));
      expect(ids).toHaveLength(5);
      const fam = ids.map((x) => pool.find((p) => p.id === x)!.family);
      expect(new Set(fam).size).toBe(5);
      const mean = ids.reduce((s, x) => s + pool.find((p) => p.id === x)!.answers.length, 0) / 5;
      expect(mean).toBeGreaterThanOrEqual(8);
      expect(mean).toBeLessThanOrEqual(20);
    }
  });

  it("AC-DC-011 does not repeat a prompt within the window across many runs", () => {
    let history: string[] = [];
    const seen: string[] = [];
    for (let i = 0; i < 8; i++) {
      const r = composeRun(pool, history, makeRng("RUNSEED002", "deep-cut", i));
      history = r.history;
      seen.push(...r.ids);
    }
    expect(new Set(seen).size).toBe(seen.length);
  });

  it("is deterministic for a seed", () => {
    expect(composeRun(pool, [], makeRng("RUNSEED003", "deep-cut", 1))).toEqual(
      composeRun(pool, [], makeRng("RUNSEED003", "deep-cut", 1)),
    );
  });
});
