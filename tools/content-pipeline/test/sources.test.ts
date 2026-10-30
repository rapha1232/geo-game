import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { fetchSources } from "../src/fetch.ts";
import { parseLock, serializeLock, verifyAgainstLock, type LockFile } from "../src/lock.ts";
import {
  CONTINENT_CODES,
  indexByCode,
  neCode,
  regionSlug,
  type NeCollection,
  type NeFeature,
} from "../src/ne.ts";
import type { SourceDef } from "../src/sources.ts";
import { sha256 } from "../src/util.ts";
import {
  capitalsQuery,
  fetchWikidataSnapshot,
  namesQuery,
  parseCapitals,
  parseCountries,
  type Fetcher,
} from "../src/wikidata.ts";
import { MEMBERS } from "./fixtures/members.ts";
import { readJson } from "./helpers.ts";

const enc = (s: string) => new TextEncoder().encode(s);
const feature = (props: Record<string, unknown>): NeFeature => ({
  type: "Feature",
  properties: props,
  geometry: {
    type: "Polygon",
    coordinates: [
      [
        [0, 0],
        [0, 1],
        [1, 1],
        [0, 0],
      ],
    ],
  },
});

describe("Natural Earth codes", () => {
  it("uses ISO_A3_EH, then ADM0_A3, and applies the two known fixes", () => {
    expect(neCode({ ISO_A3_EH: "FRA", ISO_A3: "-99", ADM0_A3: "FRA" })).toBe("FRA");
    expect(neCode({ ISO_A3_EH: "-99", ADM0_A3: "KOS" })).toBe("XKX");
    expect(neCode({ ISO_A3_EH: "PSE", ADM0_A3: "PSX" })).toBe("PSE");
    expect(neCode({ ISO_A3_EH: "-99", ADM0_A3: "PSX" })).toBe("PSE");
    expect(neCode({ ISO_A3_EH: "-99", ADM0_A3: "-99" })).toBeNull();
    expect(neCode({})).toBeNull();
  });

  it("maps continents and slugs regions", () => {
    expect(CONTINENT_CODES["North America"]).toBe("NA");
    expect(CONTINENT_CODES["Seven seas (open ocean)"]).toBeUndefined();
    expect(regionSlug("Western Europe")).toBe("western-europe");
    expect(regionSlug("Australia and New Zealand")).toBe("australia-and-new-zealand");
  });

  it("picks the main feature when dependencies share the sovereign's code (Australia and the Indian Ocean Territories)", () => {
    const col = readJson<NeCollection>("ne-50m.json");
    const idx = indexByCode(col);
    expect(idx.get("AUS")?.name).toBe("Australia");
    expect(idx.get("FRA")?.name).toBe("France");
    expect(col.features.filter((f) => f.properties["ISO_A3_EH"] === "AUS").length).toBeGreaterThan(
      1,
    );
  });

  it("fails when it cannot choose, instead of choosing silently", () => {
    const a = feature({ NAME: "A", ADM0_A3: "XXX", ISO_A3_EH: "XXX" });
    const b = feature({ NAME: "B", ADM0_A3: "XXX", ISO_A3_EH: "XXX" });
    expect(() => indexByCode({ type: "FeatureCollection", features: [a, b] })).toThrow(
      /2 features for XXX.*0 of them|2 of them/,
    );
    const c = feature({ NAME: "C", ADM0_A3: "YYY", ISO_A3_EH: "ZZZ" });
    const d = feature({ NAME: "D", ADM0_A3: "WWW", ISO_A3_EH: "ZZZ" });
    expect(() => indexByCode({ type: "FeatureCollection", features: [c, d] })).toThrow(/0 of them/);
  });

  it("skips features with no code or no geometry", () => {
    const idx = indexByCode({
      type: "FeatureCollection",
      features: [
        feature({ NAME: "Nowhere", ISO_A3_EH: "-99", ADM0_A3: "-99" }),
        { ...feature({ NAME: "Ghost", ISO_A3_EH: "GGG", ADM0_A3: "GGG" }), geometry: null },
      ],
    });
    expect(idx.size).toBe(0);
  });
});

describe("Wikidata", () => {
  const b = (o: Record<string, string>) =>
    Object.fromEntries(Object.entries(o).map(([k, v]) => [k, { value: v }]));
  it("queries Wikidata's own code for Kosovo (XKS), not Meridian's XKX", () => {
    expect(namesQuery(["FRA", "XKX"])).toContain('"XKS"');
    expect(namesQuery(["FRA", "XKX"])).not.toContain('"XKX"');
    expect(capitalsQuery(["XKX"])).toContain('"XKS"');
  });

  it("parses names, alt labels and official names, maps XKS to XKX and sorts by code", () => {
    const rows = parseCountries({
      results: {
        bindings: [
          b({
            item: "http://www.wikidata.org/entity/Q1246",
            iso3: "XKS",
            label: "Kosovo",
            alts: "Republic of Kosovo|Kosova",
            officials: "",
          }),
          b({
            item: "http://www.wikidata.org/entity/Q142",
            iso3: "FRA",
            label: "France",
            alts: "French Republic|France",
            officials: "French Republic",
          }),
        ],
      },
    });
    expect(rows.map((r) => r.code)).toEqual(["FRA", "XKX"]);
    expect(rows[1]).toMatchObject({
      qid: "Q1246",
      altLabels: ["Kosova", "Republic of Kosovo"],
      officialNames: [],
    });
    expect(rows[0]?.altLabels).toEqual(["French Republic", "France"].sort());
  });

  it("uses an editorial pick for a duplicated code, and fails for an unpicked one", () => {
    const two = (code: string) => ({
      results: {
        bindings: [
          b({
            item: "http://www.wikidata.org/entity/Q219060",
            iso3: code,
            label: "State of Palestine",
            alts: "",
            officials: "",
          }),
          b({
            item: "http://www.wikidata.org/entity/Q407199",
            iso3: code,
            label: "Other",
            alts: "",
            officials: "",
          }),
        ],
      },
    });
    expect(parseCountries(two("PSE"))[0]?.qid).toBe("Q219060");
    expect(() => parseCountries(two("ZZZ"))).toThrow(/Add an editorial pick/);
  });

  it("parses capital coordinates: WKT is lon lat, we store [lat, lon]", () => {
    const caps = parseCapitals({
      results: {
        bindings: [
          b({
            iso3: "FRA",
            cap: "http://www.wikidata.org/entity/Q90",
            capLabel: "Paris",
            coord: "Point(2.3522 48.8566)",
          }),
          b({ iso3: "BOL", cap: "http://www.wikidata.org/entity/Q1491", capLabel: "Sucre" }),
        ],
      },
    });
    expect(caps.find((c) => c.label === "Paris")?.coord).toEqual([48.8566, 2.3522]);
    expect(caps.find((c) => c.label === "Sucre")?.coord).toBeNull();
  });

  it("fetchWikidataSnapshot sends a User-Agent and the Accept header, and stops on an HTTP error", async () => {
    const calls: { url: string; headers?: Record<string, string> }[] = [];
    const ok: Fetcher = async (url, init) => {
      calls.push({ url, ...(init?.headers ? { headers: init.headers } : {}) });
      return {
        ok: true,
        status: 200,
        json: async () => ({ results: { bindings: [] } }),
        arrayBuffer: async () => new ArrayBuffer(0),
      };
    };
    const snap = await fetchWikidataSnapshot(["FRA"], "2026-10-30", ok);
    expect(calls).toHaveLength(2);
    expect(calls[0]?.headers?.["User-Agent"]).toMatch(/Meridian-content-pipeline/);
    expect(calls[0]?.headers?.["Accept"]).toContain("sparql-results+json");
    expect(snap.retrieved_on).toBe("2026-10-30");
    const bad: Fetcher = async () => ({
      ok: false,
      status: 429,
      json: async () => ({}),
      arrayBuffer: async () => new ArrayBuffer(0),
    });
    await expect(fetchWikidataSnapshot(["FRA"], "2026-10-30", bad)).rejects.toThrow(/HTTP 429/);
  });

  it("the committed fixture covers the tricky cases", () => {
    const snap = readJson<{ countries: { code: string; qid: string }[] }>("wikidata.json");
    expect(snap.countries.find((c) => c.code === "PSE")?.qid).toBe("Q219060");
    expect(snap.countries.map((c) => c.code)).toContain("XKX");
    expect(
      MEMBERS.every((m) => m.code === "ATA" || snap.countries.some((c) => c.code === m.code)),
    ).toBe(true);
  });
});

describe("lock file and fetch", () => {
  const def = (id: string, file: string): SourceDef => ({
    id,
    source: "ne",
    url: `https://example.test/${id}`,
    version: "v1",
    file,
  });
  const fetcherFor =
    (bodies: Record<string, string>, seen: string[] = []): Fetcher =>
    async (url) => {
      seen.push(url);
      const id = url.split("/").pop() as string;
      const body = bodies[id];
      return body === undefined
        ? {
            ok: false,
            status: 404,
            json: async () => ({}),
            arrayBuffer: async () => new ArrayBuffer(0),
          }
        : {
            ok: true,
            status: 200,
            json: async () => ({}),
            arrayBuffer: async () => enc(body).buffer as ArrayBuffer,
          };
    };

  it("round-trips and sorts entries so regenerating never churns the file", () => {
    const lock: LockFile = {
      entries: [
        { id: "b", source: "ne", url: "u", version: "v", sha256: "2".repeat(64), bytes: 2 },
        { id: "a", source: "ne", url: "u", version: "v", sha256: "1".repeat(64), bytes: 1 },
      ],
    };
    const text = serializeLock(lock);
    expect(text.indexOf("id: a")).toBeLessThan(text.indexOf("id: b"));
    expect(parseLock(text).entries.map((e) => e.id)).toEqual(["a", "b"]);
    expect(serializeLock(parseLock(text))).toBe(text);
    expect(parseLock("").entries).toEqual([]);
  });

  it("verifyAgainstLock detects a missing pin and a changed byte", () => {
    const lock: LockFile = {
      entries: [
        { id: "a", source: "ne", url: "u", version: "v", sha256: sha256("hello"), bytes: 5 },
      ],
    };
    expect(verifyAgainstLock(lock, "a", enc("hello")).ok).toBe(true);
    expect(verifyAgainstLock(lock, "a", enc("hellO"))).toMatchObject({
      ok: false,
      reason: expect.stringContaining("mismatch"),
    });
    expect(verifyAgainstLock(lock, "zzz", enc("x"))).toMatchObject({
      ok: false,
      reason: expect.stringContaining("not pinned"),
    });
  });

  it("downloads when missing, pins with --update-lock, then re-verifies cached files without downloading", async () => {
    const dir = await mkdtemp(join(tmpdir(), "mer-fetch-"));
    const seen: string[] = [];
    const first = await fetchSources(
      {
        rawDir: dir,
        lock: { entries: [] },
        updateLock: true,
        fetcher: fetcherFor({ one: "AAA" }, seen),
      },
      [def("one", "x/one.txt")],
    );
    expect(first.downloaded).toEqual(["one"]);
    expect(first.lock.entries[0]).toMatchObject({ id: "one", sha256: sha256("AAA"), bytes: 3 });
    expect(await readFile(join(dir, "x/one.txt"), "utf8")).toBe("AAA");
    const second = await fetchSources(
      { rawDir: dir, lock: first.lock, updateLock: false, fetcher: fetcherFor({}, seen) },
      [def("one", "x/one.txt")],
    );
    expect(second).toMatchObject({ downloaded: [], cached: ["one"] });
    expect(seen).toHaveLength(1);
  });

  it("refuses a file that differs from its pin, including a tampered cache, unless told to update", async () => {
    const dir = await mkdtemp(join(tmpdir(), "mer-fetch-"));
    const ok = await fetchSources(
      { rawDir: dir, lock: { entries: [] }, updateLock: true, fetcher: fetcherFor({ one: "AAA" }) },
      [def("one", "one.txt")],
    );
    await writeFile(join(dir, "one.txt"), "TAMPERED");
    await expect(
      fetchSources({ rawDir: dir, lock: ok.lock, updateLock: false, fetcher: fetcherFor({}) }, [
        def("one", "one.txt"),
      ]),
    ).rejects.toThrow(/sha256 mismatch.*--update-lock/);
    const accepted = await fetchSources(
      { rawDir: dir, lock: ok.lock, updateLock: true, fetcher: fetcherFor({}) },
      [def("one", "one.txt")],
    );
    expect(accepted.lock.entries[0]?.sha256).toBe(sha256("TAMPERED"));
  });

  it("fails on an unpinned source without --update-lock, and on an HTTP error", async () => {
    const dir = await mkdtemp(join(tmpdir(), "mer-fetch-"));
    await expect(
      fetchSources(
        {
          rawDir: dir,
          lock: { entries: [] },
          updateLock: false,
          fetcher: fetcherFor({ one: "A" }),
        },
        [def("one", "one.txt")],
      ),
    ).rejects.toThrow(/not pinned/);
    await expect(
      fetchSources(
        { rawDir: dir, lock: { entries: [] }, updateLock: true, fetcher: fetcherFor({}) },
        [def("gone", "gone.txt")],
      ),
    ).rejects.toThrow(/HTTP 404/);
  });
});
