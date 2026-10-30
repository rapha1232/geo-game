import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
// @ts-expect-error plain .mjs script without types
import { generate } from "../scripts/gen-sources.mjs";
import sources from "../lib/generated/sources.json";
import { PRIVACY, TERMS } from "../lib/legal";
import { COUNTRY_RULES, SCORING_RULES } from "../lib/rules";

describe("AC-PL-022 sources page data", () => {
  it("lib/generated/sources.json matches data/sources.registry.yaml (run `pnpm --filter @meridian/web gen:sources`)", async () => {
    const onDisk = await readFile(
      new URL("../lib/generated/sources.json", import.meta.url),
      "utf8",
    );
    expect(onDisk).toBe(await generate());
  });
  it("lists every shipped source, and each one that requires attribution carries its text", () => {
    expect(sources.length).toBeGreaterThan(3);
    for (const s of sources) if (s.attributionRequired) expect(s.attribution).toBeTruthy();
  });
});

describe("legal pages (Q-06)", () => {
  it("have unique section headings and non-empty bodies", () => {
    for (const doc of [TERMS, PRIVACY, COUNTRY_RULES, SCORING_RULES]) {
      const heads = doc.map((s) => s.heading);
      expect(new Set(heads).size).toBe(heads.length);
      for (const s of doc)
        expect((s.paragraphs?.length ?? 0) + (s.bullets?.length ?? 0)).toBeGreaterThan(0);
    }
  });
  it("the privacy statement matches the architecture's retention figures", () => {
    const text = JSON.stringify(PRIVACY);
    expect(text).toContain("two years");
  });
});
