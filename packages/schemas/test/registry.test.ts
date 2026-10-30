import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";
import { licenseProblems, sourceRegistry } from "../src/index";

const registry = sourceRegistry.parse(
  parse(readFileSync(resolve(process.cwd(), "../../data/sources.registry.yaml"), "utf8"), {
    schema: "core",
  }),
);
const entry = (over: object) => ({
  id: "x",
  name: "X",
  kind: "dataset",
  license: "CC0 1.0",
  attribution_required: false,
  verification: "pending",
  used_in: [],
  ...over,
});

describe("data/sources.registry.yaml", () => {
  it("validates against the schema", () =>
    expect(registry.sources.length).toBeGreaterThanOrEqual(14));

  it("covers every source in DATA_AND_CONTENT §2", () => {
    const ids = registry.sources.map((s) => s.id);
    for (const id of ["ne", "wd", "wb", "gn", "wpv", "un", "fi", "hb", "cs", "md", "mer"])
      expect(ids).toContain(id);
  });

  it("T0.6 LICENSE_UNVERIFIED passes for everything the R1 packs use", () => {
    const used = registry.sources.flatMap((s) => (s.used_in.length > 0 ? [s.id] : []));
    expect(used.length).toBeGreaterThan(0);
    expect(licenseProblems(registry, used)).toEqual([]);
  });

  it("the rules from DATA_AND_CONTENT §2.1 hold: no unknown or non-commercial source is verified", () => {
    for (const s of registry.sources) {
      if (s.verification === "done")
        expect(s.license).not.toMatch(/unknown|not stated|non-?commercial/i);
    }
  });

  it("UN M49 is rejected and unused, and fonts carry the OFL", () => {
    expect(registry.sources.find((s) => s.id === "un")).toMatchObject({
      verification: "rejected",
      used_in: [],
    });
    for (const id of ["font-source-sans-3", "font-source-serif-4"])
      expect(registry.sources.find((s) => s.id === id)).toMatchObject({
        license: "SIL OFL 1.1",
        verification: "done",
      });
  });
});

describe("registry schema rules", () => {
  it("a verified source needs a date and the evidence that was read", () => {
    expect(sourceRegistry.safeParse({ sources: [entry({ verification: "done" })] }).success).toBe(
      false,
    );
    expect(
      sourceRegistry.safeParse({
        sources: [entry({ verification: "done", verified_on: "2026-10-30", evidence: "quote" })],
      }).success,
    ).toBe(true);
  });
  it("attribution_required needs the attribution text", () => {
    expect(
      sourceRegistry.safeParse({ sources: [entry({ attribution_required: true })] }).success,
    ).toBe(false);
  });
  it("rejects duplicate ids and a rejected source that is used", () => {
    expect(sourceRegistry.safeParse({ sources: [entry({}), entry({})] }).success).toBe(false);
    expect(
      sourceRegistry.safeParse({
        sources: [entry({ verification: "rejected", used_in: ["core.countries"] })],
      }).success,
    ).toBe(false);
  });
});

describe("licenseProblems (LICENSE_UNVERIFIED)", () => {
  const r = sourceRegistry.parse({
    sources: [
      entry({ id: "ok", verification: "done", verified_on: "2026-10-30", evidence: "e" }),
      entry({ id: "pend", verification: "pending" }),
      entry({ id: "rej", verification: "rejected" }),
      entry({
        id: "nc",
        verification: "done",
        verified_on: "2026-10-30",
        evidence: "e",
        license: "CC BY-NC 4.0 non-commercial",
      }),
      entry({
        id: "unk",
        verification: "done",
        verified_on: "2026-10-30",
        evidence: "e",
        license: "Unknown",
      }),
    ],
  });
  it("passes verified sources", () => expect(licenseProblems(r, ["ok"])).toEqual([]));
  it("fails pending, rejected, non-commercial, unknown and unlisted sources", () => {
    const p = licenseProblems(r, ["pend", "rej", "nc", "unk", "ghost"]);
    expect(p).toHaveLength(5);
    expect(p.join("\n")).toMatch(/pend: verification is pending/);
    expect(p.join("\n")).toMatch(/ghost: not in the source registry/);
  });
  it("reports each source once", () =>
    expect(licenseProblems(r, ["pend", "pend"])).toHaveLength(1));
});
