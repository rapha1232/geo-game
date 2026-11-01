import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
// @ts-expect-error plain .mjs script without types
import { countriesOf, generate } from "../scripts/gen-countries.mjs";
import { COUNTRIES, countryName } from "../lib/countries";
import { SITEMAP_PATHS } from "../app/sitemap";

describe("server-side country list", () => {
  it("lib/generated/countries.json matches content/ (run `pnpm --filter @meridian/web gen:countries`)", async () => {
    const onDisk = await readFile(
      new URL("../lib/generated/countries.json", import.meta.url),
      "utf8",
    );
    expect(onDisk).toBe(await generate());
  });
  it("holds the default set, sovereign-197, with canonical names", () => {
    expect(COUNTRIES).toHaveLength(197);
    expect(countryName("FRA")).toBe("France");
    expect(countryName("ZZZ")).toBeUndefined();
  });
  it("refuses a set member with no name", () => {
    expect(() => countriesOf({ members: [{ code: "XXX" }] }, { countries: {} })).toThrow(/XXX/);
  });
});

describe("sitemap", () => {
  it("lists each page once, including every Atlas place and named quiz", () => {
    expect(new Set(SITEMAP_PATHS).size).toBe(SITEMAP_PATHS.length);
    expect(SITEMAP_PATHS).toContain("/explore/country:FRA");
    expect(SITEMAP_PATHS).toContain("/play/quiz/countries-of-the-world");
    expect(SITEMAP_PATHS).toContain("/play/subdivisions/usa");
    expect(SITEMAP_PATHS.some((p) => p.startsWith("/dev") || p.startsWith("/c/"))).toBe(false);
  });
});
