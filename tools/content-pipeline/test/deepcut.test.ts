import { describe, expect, it } from "vitest";
import type { Entity } from "@meridian/schemas";
import type { Geometry } from "../src/geometry.ts";
import {
  crossesLatitude,
  crossesLongitude,
  generatePrompts,
  type DeepCutInput,
} from "../src/deepcut.ts";
import { deepcutRules } from "../src/validate/rules.ts";

const box = (w: number, s: number, e: number, n: number): Geometry =>
  ({
    type: "Polygon",
    coordinates: [
      [
        [w, s],
        [w, n],
        [e, n],
        [e, s],
        [w, s],
      ],
    ],
  }) as Geometry;

const mk = (iso: string, name: string, continent: string, over: Partial<Entity> = {}): Entity =>
  ({
    id: `country:${iso}`,
    type: "country",
    names: { canonical: name, aliases: [] },
    parent_ids: [`continent:${continent}`],
    sets: ["sovereign-197"],
    population: { value: 5e6, year: 2024, source: "wd" },
    area_km2: { value: 100_000, source: "ne" },
    difficulty: { recall: 0.5 },
    ...over,
  }) as unknown as Entity;

describe("lines of latitude and longitude", () => {
  it("a polygon crossing the equator is found, one wholly north is not", () => {
    expect(crossesLatitude(box(10, -2, 12, 3), 0)).toBe(true);
    expect(crossesLatitude(box(10, 1, 12, 3), 0)).toBe(false);
  });
  it("finds the prime meridian but ignores an edge that wraps the antimeridian", () => {
    expect(crossesLongitude(box(-2, 40, 2, 45), 0)).toBe(true);
    expect(crossesLongitude(box(170, 0, 190, 3), 0)).toBe(false);
  });
});

describe("prompt generation", () => {
  const pt = ["PRT", "BRA", "AGO", "MOZ", "CPV"].map((c) => mk(c, c, c === "BRA" ? "SA" : "AF"));
  const others = ["ESP", "FRA", "DEU", "ITA", "AUT", "CHE"].map((c) => mk(c, c, "EU"));
  const entities = [...pt, ...others];
  const langs = Object.fromEntries(pt.map((e) => [e.id.slice(8), ["Portuguese"]]));
  const input: DeepCutInput = {
    entities,
    edges: [
      ["FRA", "ESP"],
      ["FRA", "DEU"],
      ["FRA", "ITA"],
      ["FRA", "CHE"],
      ["FRA", "AUT"],
    ].map(([a, b]) => ({ a: `country:${a}`, b: `country:${b}` })),
    geometry: new Map(entities.map((e, i) => [e.id, box(i, -1, i + 1, 1)])),
    languages: { retrieved_on: "2026-11-01", endpoint: "x", languages: langs },
  };
  const prompts = generatePrompts(input);

  it("AC-DC-009 keeps only instances with 4 to 30 answers", () => {
    expect(prompts.length).toBeGreaterThan(0);
    for (const p of prompts) {
      expect(p.answers.length).toBeGreaterThanOrEqual(4);
      expect(p.answers.length).toBeLessThanOrEqual(30);
    }
  });
  it("builds language, neighbour and line prompts with a prior for every answer", () => {
    const lang = prompts.find((p) => p.id === "prompt:lang-portuguese")!;
    expect(lang.text).toBe("Portuguese is an official language");
    expect(lang.invalid).toBe("{name}: Portuguese is not an official language.");
    expect(Object.keys(lang.rarity_prior).sort()).toEqual([...lang.answers].sort());
    expect(prompts.find((p) => p.id === "prompt:borders-FRA")?.answers).toHaveLength(5);
    expect(prompts.find((p) => p.id === "prompt:line-equator")?.answers.length).toBe(11);
  });
  it("is deterministic and sorted by id", () => {
    expect(JSON.stringify(generatePrompts(input))).toBe(JSON.stringify(prompts));
    expect(prompts.map((p) => p.id)).toEqual([...prompts.map((p) => p.id)].sort());
  });
  it("applies a sourced override and rejects an unknown prompt or country", () => {
    const o = {
      prompt: "prompt:lang-portuguese",
      add: ["country:ESP"],
      source: "https://x.test",
      reason: "r",
    };
    expect(
      generatePrompts({ ...input, overrides: [o] }).find((p) => p.id === "prompt:lang-portuguese")
        ?.answers,
    ).toContain("country:ESP");
    expect(() =>
      generatePrompts({ ...input, overrides: [{ ...o, prompt: "prompt:nope" }] }),
    ).toThrow(/unknown prompt/);
    expect(() =>
      generatePrompts({ ...input, overrides: [{ ...o, add: ["country:ZZZ"] }] }),
    ).toThrow(/not a sovereign country/);
  });
  it("the validator flags a prompt outside the bounds", () => {
    const bad = [
      {
        id: "prompt:x",
        family: "f",
        answers: ["country:PRT"],
        rarity_prior: { "country:PRT": 0.5 },
      },
    ];
    expect(deepcutRules({ entities, deepcut: bad } as never)).toHaveLength(1);
    expect(deepcutRules({ entities, deepcut: prompts } as never)).toEqual([]);
  });
});
