import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { ambiguityGroup, dispute } from "@meridian/schemas";
import { buildPacks } from "../src/build.ts";
import { adjacencyOverrides, silhouetteOverrides } from "../src/derive.ts";
import { parseEditorial } from "../src/editorial.ts";
import { confusablesByCode, confusablesFile, extractFlags, readTgz } from "../src/flags.ts";
import { contentSetFromBuild, errorsOf, validate } from "../src/validate/index.ts";
import { fixtureInput, repoPath } from "./helpers.ts";

describe("confusablesByCode", () => {
  it("lists the other members of every group, merged across groups, sorted", () => {
    const m = confusablesByCode([
      ["AAA", "BBB", "CCC"],
      ["AAA", "DDD"],
    ]);
    expect(m.get("AAA")).toEqual(["BBB", "CCC", "DDD"]);
    expect(m.get("BBB")).toEqual(["AAA", "CCC"]);
    expect(m.get("DDD")).toEqual(["AAA"]);
  });
  it("the committed file parses, and every group is symmetric by construction", () => {
    const file = confusablesFile.parse(
      parse(readFileSync(repoPath("content/flags/confusables.yaml"), "utf8"), { schema: "core" }),
    );
    const m = confusablesByCode(file.groups);
    for (const [a, others] of m) for (const b of others) expect(m.get(b)).toContain(a);
    expect(m.get("TCD")).toEqual(expect.arrayContaining(["ROU", "AND"]));
    expect(m.get("IDN")).toEqual(expect.arrayContaining(["MCO", "POL"]));
  });
});

const tgz = repoPath("data/raw/fi/flag-icons-7.6.0.tgz");
describe.skipIf(!existsSync(tgz))("flag-icons tarball", () => {
  const bytes = new Uint8Array(readFileSync(tgz));
  it("reads files out of the pinned tarball", () => {
    const files = readTgz(bytes);
    expect(files.has("package/flags/4x3/fr.svg")).toBe(true);
    expect(files.has("package/LICENSE")).toBe(true);
  });
  it("extracts minified 4:3 SVGs without the library's id", () => {
    const flags = extractFlags(bytes, ["fr", "TD", "zz"]);
    expect([...flags.keys()]).toEqual(["FR", "TD"]);
    const fr = flags.get("FR")!;
    expect(fr).toMatch(/^<svg [^>]*viewBox="0 0 640 480"/);
    expect(fr).not.toMatch(/id="flag-icons/);
    expect(fr).not.toMatch(/>\s+</);
    expect(fr.length).toBeLessThan(2000);
  });
});

const haveRaw =
  existsSync(repoPath("data/raw/ne/ne_10m_admin_0_countries.geojson")) && existsSync(tgz);
describe.skipIf(!haveRaw)("T1.9 flags in the real build", () => {
  const yaml = (f: string): Record<string, unknown> =>
    parse(readFileSync(repoPath(f), "utf8"), { schema: "core" }) as Record<string, unknown>;
  const read = (f: string) => JSON.parse(readFileSync(repoPath(f), "utf8"));
  const members = (
    yaml("content/sets/sovereign-197.yaml") as { members: { code: string; un: boolean }[] }
  ).members;
  const input = fixtureInput({
    members,
    ne: {
      "110m": read("data/raw/ne/ne_110m_admin_0_countries.geojson"),
      "50m": read("data/raw/ne/ne_50m_admin_0_countries.geojson"),
      "10m": read("data/raw/ne/ne_10m_admin_0_countries.geojson"),
    },
    wikidata: read("data/snapshots/wikidata-countries.json"),
    editorial: parseEditorial(yaml("content/countries.yaml")),
    ambiguity: (yaml("content/ambiguity.yaml").groups as unknown[]).map((g) =>
      ambiguityGroup.parse(g),
    ),
    disputes: (yaml("content/disputes.yaml").disputes as unknown[]).map((d) => dispute.parse(d)),
    derive: {
      silhouettes: silhouetteOverrides.parse(yaml("content/overrides/silhouettes.yaml")).overrides,
      adjacency: adjacencyOverrides.parse(yaml("content/overrides/adjacency.yaml")),
    },
    flags: {
      svg: extractFlags(
        new Uint8Array(readFileSync(tgz)),
        (
          read("data/raw/ne/ne_10m_admin_0_countries.geojson").features as {
            properties: { ISO_A2_EH: string };
          }[]
        ).map((f) => f.properties.ISO_A2_EH),
      ),
      confusables: confusablesByCode(
        confusablesFile.parse(yaml("content/flags/confusables.yaml")).groups,
      ),
    },
  });
  const out = buildPacks(input);
  const pack = JSON.parse(
    new TextDecoder().decode(out.files.find((f) => f.name === "flags.svg")!.bytes),
  ) as { flags: Record<string, string> };
  const core = JSON.parse(
    new TextDecoder().decode(out.files.find((f) => f.name === "core.countries")!.bytes),
  ) as {
    entities: { id: string; flag?: { svg: string; aspect: number; confusables: string[] } }[];
  };

  it("every one of the 197 countries has a flag, and the pack stays under 2.5 MB", () => {
    expect(Object.keys(pack.flags)).toHaveLength(197);
    expect(
      core.entities.every((e) => e.flag?.svg === e.id && pack.flags[e.id]?.startsWith("<svg")),
    ).toBe(true);
    expect(out.files.find((f) => f.name === "flags.svg")!.bytes.length).toBeLessThan(2_500_000);
  });
  it("AC-QZ-019 (data): Chad lists Romania among its confusable flags", () => {
    expect(core.entities.find((e) => e.id === "country:TCD")!.flag!.confusables).toContain(
      "country:ROU",
    );
  });
  it("FLAG_MISSING: dropping a flag, or a confusable that is not an entity, fails validation; the real pack passes", () => {
    const set = contentSetFromBuild(input, out, { fullSets: true });
    expect(errorsOf(validate(set)).filter((i) => i.code === "FLAG_MISSING")).toEqual([]);
    const missing = {
      ...set,
      flagIds: new Set([...set.flagIds!].filter((id) => id !== "country:FRA")),
    };
    expect(
      errorsOf(validate(missing)).some((i) => i.code === "FLAG_MISSING" && i.ref === "country:FRA"),
    ).toBe(true);
    const bogus = {
      ...set,
      entities: set.entities.map((e) =>
        e.id === "country:TCD" ? { ...e, flag: { ...e.flag!, confusables: ["country:ZZZ"] } } : e,
      ),
    };
    expect(errorsOf(validate(bogus)).some((i) => /not an entity/.test(i.message))).toBe(true);
  }, 180_000);
});
