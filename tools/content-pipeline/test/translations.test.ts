import { describe, expect, it } from "vitest";
import type { Entity } from "@meridian/schemas";
import {
  addTranslations,
  translationsQuery,
  type TranslationsSnapshot,
} from "../src/translations.ts";

const e = (iso: string, name: string, aliases: string[] = []): Entity =>
  ({
    id: `country:${iso}`,
    type: "country",
    names: { canonical: name, aliases: aliases.map((text) => ({ text, kind: "common" })) },
  }) as unknown as Entity;
const snap = (labels: TranslationsSnapshot["labels"]): TranslationsSnapshot => ({
  retrieved_on: "2026-11-01",
  endpoint: "x",
  languages: ["es", "fr", "de"],
  labels,
});
const tr = (entity: Entity) =>
  entity.names.aliases.filter((a) => a.kind === "translation").map((a) => `${a.lang}:${a.text}`);

describe("addTranslations", () => {
  it("adds labels as translation aliases tagged with their language", () => {
    const { entities, report } = addTranslations(
      [e("DEU", "Germany")],
      snap({ DEU: { de: "Deutschland", es: "Alemania", fr: "Allemagne" } }),
    );
    expect(tr(entities[0] as Entity).sort()).toEqual([
      "de:Deutschland",
      "es:Alemania",
      "fr:Allemagne",
    ]);
    expect(report.added).toBe(3);
  });

  it("skips a label that only repeats a name the country already has, ignoring accents and case", () => {
    const { entities, report } = addTranslations(
      [e("NER", "Niger")],
      snap({ NER: { es: "Níger", fr: "Niger", de: "Niger" } }),
    );
    expect(tr(entities[0] as Entity)).toEqual([]);
    expect(report.skippedSame).toBe(3);
  });

  it("skips a label that is another country's English name, so a right answer never turns into a wrong one", () => {
    const { entities, report } = addTranslations(
      [e("GNQ", "Equatorial Guinea"), e("GIN", "Guinea")],
      snap({ GNQ: { es: "Guinea" }, GIN: { es: "Guinea" } }),
    );
    expect(tr(entities[0] as Entity)).toEqual([]);
    expect(tr(entities[1] as Entity)).toEqual([]);
    expect(report.skippedCollision.length).toBeGreaterThan(0);
  });

  it("skips two countries sharing a label in the same language but allows it across languages", () => {
    const { entities } = addTranslations(
      [e("AAA", "Alpha"), e("BBB", "Beta")],
      snap({ AAA: { es: "Mismo", fr: "Un" }, BBB: { es: "Mismo", de: "Un" } }),
    );
    expect(tr(entities[0] as Entity)).toEqual(["fr:Un"]);
    expect(tr(entities[1] as Entity)).toEqual(["de:Un"]);
  });

  it("is deterministic and leaves entities without labels untouched", () => {
    const input = [e("AAA", "Alpha"), e("ZZZ", "Zed")];
    const a = addTranslations(input, snap({ AAA: { es: "Alfa" } }));
    const b = addTranslations(input, snap({ AAA: { es: "Alfa" } }));
    expect(JSON.stringify(a.entities)).toBe(JSON.stringify(b.entities));
    expect(a.entities[1]).toBe(input[1]);
  });

  it("asks Wikidata for the exact items in the answer languages", () => {
    const q = translationsQuery(["Q183", "Q142"]);
    expect(q).toContain("wd:Q183 wd:Q142");
    for (const l of ["es", "fr", "de", "pt", "it", "nl"]) expect(q).toContain(`"${l}"`);
  });
});
