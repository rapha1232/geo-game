import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { entity, licenseProblems, manifest, topology, type Entity } from "@meridian/schemas";
import { buildPacks } from "../src/build.ts";
import { writeBuild } from "../src/cli.ts";
import { pointInsideLargest } from "../src/geometry.ts";
import { indexByCode, type NeCollection } from "../src/ne.ts";
import { sha256 } from "../src/util.ts";
import { uploadBuild, type PutFn } from "../src/upload.ts";
import { fixtureInput, readJson, registry, repoPath } from "./helpers.ts";

const decode = (b: Uint8Array) =>
  JSON.parse(new TextDecoder().decode(b)) as Record<string, unknown>;
const pack = (out: ReturnType<typeof buildPacks>, name: string) =>
  decode(out.files.find((f) => f.name === name)?.bytes as Uint8Array);

describe("buildPacks (fixtures)", () => {
  const out = buildPacks(fixtureInput());

  it("DETERMINISM: building twice gives identical bytes, names and manifest", () => {
    const again = buildPacks(fixtureInput());
    expect(again.files.map((f) => [f.file, f.sha256])).toEqual(
      out.files.map((f) => [f.file, f.sha256]),
    );
    expect(JSON.stringify(again.manifest)).toBe(JSON.stringify(out.manifest));
    expect(again.releaseNotes).toBe(out.releaseNotes);
  });

  it("does not depend on the order of the input members", () => {
    const shuffled = buildPacks(fixtureInput({ members: [...fixtureInput().members].reverse() }));
    expect(shuffled.files.map((f) => f.sha256)).toEqual(out.files.map((f) => f.sha256));
  });

  it("file names carry the first 6 hex digits of the content hash, and the hash is of the bytes", () => {
    for (const f of out.files) {
      expect(f.sha256).toBe(sha256(f.bytes));
      expect(f.file).toBe(`${f.name}.${f.sha256.slice(0, 6)}.json`);
    }
  });

  it("changing the input changes the hash of the pack it touches, and only that pack", () => {
    const input = fixtureInput();
    const snap = {
      ...input.wikidata,
      countries: input.wikidata.countries.map((c) =>
        c.code === "FRA" ? { ...c, altLabels: [...c.altLabels, "La France"] } : c,
      ),
    };
    const changed = buildPacks({ ...input, wikidata: snap });
    const diff = out.files
      .filter((f, i) => f.sha256 !== changed.files[i]?.sha256)
      .map((f) => f.name);
    expect(diff).toEqual(["core.countries"]);
  });

  it("the manifest validates, lists every pack with its real size and hash, and lists the licenses used", () => {
    expect(manifest.safeParse(out.manifest).success).toBe(true);
    const v = out.manifest.versions[out.version];
    expect(Object.keys(v?.packs ?? {}).sort()).toEqual([
      "core.countries",
      "geo.world.10m",
      "geo.world.110m",
      "geo.world.50m",
    ]);
    for (const f of out.files)
      expect(v?.packs[f.name]).toEqual({
        url: `content/${out.version}/${f.file}`,
        bytes: f.bytes.length,
        sha256: f.sha256,
      });
    expect(v?.licenses).toEqual(["mer:ARR", "ne:PD", "wd:CC0"]);
  });

  it("T0.6: every source the build used is verified in the registry", () => {
    const used = registry()
      .sources.filter((s) => s.used_in.some((u) => out.files.some((f) => f.name === u)))
      .map((s) => s.id);
    expect(used.sort()).toEqual(["mer", "ne", "wd"]);
    expect(licenseProblems(registry(), used)).toEqual([]);
  });

  it("core.countries is a draft pack of schema-valid entities, with sets and ids from the editorial list", () => {
    const core = pack(out, "core.countries") as { draft: boolean; entities: Entity[] };
    expect(core.draft).toBe(true);
    expect(core.entities.map((e) => e.id)).toEqual([
      "country:AUS",
      "country:CIV",
      "country:FJI",
      "country:FRA",
      "country:NOR",
      "country:PSE",
      "country:TWN",
      "country:VAT",
      "country:XKX",
    ]);
    for (const e of core.entities) expect(entity.safeParse(e).success).toBe(true);
    const sets = Object.fromEntries(core.entities.map((e) => [e.id, e.sets]));
    expect(sets["country:FRA"]).toEqual(["sovereign-197", "un-193"]);
    expect(sets["country:XKX"]).toEqual(["sovereign-197"]);
    expect(sets["country:VAT"]).toEqual(["sovereign-197"]);
  });

  it("applies the real-data fixes: Kosovo is XKX, Palestine is PSE with its own Wikidata item, France keeps its mainland", () => {
    const core = pack(out, "core.countries") as { entities: Entity[] };
    const by = (id: string) => core.entities.find((e) => e.id === id) as Entity;
    expect(by("country:XKX").external_ids["wikidata"]).toBe("Q1246");
    expect(by("country:PSE").external_ids["wikidata"]).toBe("Q219060");
    expect(by("country:FRA").external_ids["iso2"]).toBe("FR");
    const [lat, lon] = by("country:FRA").ref_point as [number, number];
    expect(lat).toBeGreaterThan(41);
    expect(lat).toBeLessThan(52);
    expect(lon).toBeGreaterThan(-5);
    expect(lon).toBeLessThan(10);
  });

  it("aliases never repeat the canonical name, are distinct ignoring case, and carry the ISO codes", () => {
    const core = pack(out, "core.countries") as { entities: Entity[] };
    for (const e of core.entities) {
      const texts = e.names.aliases.map((a) => a.text.toLowerCase());
      expect(new Set(texts).size).toBe(texts.length);
      expect(texts).not.toContain(e.names.canonical.toLowerCase());
    }
    const civ = core.entities.find((e) => e.id === "country:CIV") as Entity;
    expect(civ.names.aliases.some((a) => a.kind === "code" && a.text === "CIV")).toBe(true);
  });

  it("Fiji's bounding box wraps the antimeridian", () => {
    const core = pack(out, "core.countries") as { entities: Entity[] };
    const [w, , e] = (core.entities.find((x) => x.id === "country:FJI") as Entity).bbox;
    expect(w).toBeGreaterThan(e);
  });

  it("geometry packs are valid TopoJSON keyed by entity id, finer scales are bigger, and 110m falls back for missing microstates", () => {
    const sizes: Record<string, number> = {};
    for (const scale of ["110m", "50m", "10m"]) {
      const topo = topology.parse(pack(out, `geo.world.${scale}`));
      const ids = (topo.objects["countries"]?.geometries ?? []).map((g) => g.id).sort();
      expect(ids).toHaveLength(9);
      expect(ids).toContain("country:VAT");
      sizes[scale] = out.files.find((f) => f.name === `geo.world.${scale}`)?.bytes.length ?? 0;
    }
    expect(sizes["10m"]).toBeGreaterThan(sizes["50m"] as number);
    expect(sizes["50m"]).toBeGreaterThan(sizes["110m"] as number);
    expect(out.fallback110).toContain("VAT");
    expect(out.releaseNotes).toContain("1:110m omits");
  });

  it("GEOM_MISSING: a member with no geometry at a scale fails the build, naming the entity and the scale", () => {
    const input = fixtureInput();
    const without = (c: NeCollection): NeCollection => ({
      ...c,
      features: c.features.filter((f) => f.properties["NAME"] !== "Fiji"),
    });
    expect(() =>
      buildPacks({ ...input, ne: { ...input.ne, "50m": without(input.ne["50m"]) } }),
    ).toThrow(/country:FJI: no geometry at 50m/);
    expect(() =>
      buildPacks({ ...input, ne: { ...input.ne, "10m": without(input.ne["10m"]) } }),
    ).toThrow(/GEOM_MISSING/);
  });

  it("every reference point lies inside its country's largest polygon (REF_POINT_OUTSIDE preview)", () => {
    const idx = indexByCode(fixtureInput().ne["10m"]);
    const core = pack(out, "core.countries") as { entities: Entity[] };
    for (const e of core.entities) {
      const ne = idx.get(e.id.slice("country:".length));
      expect(pointInsideLargest(ne?.geometry as never, e.ref_point as [number, number]), e.id).toBe(
        true,
      );
    }
  });

  it("writes a complete, readable release directory", async () => {
    const dir = await mkdtemp(join(tmpdir(), "mer-dist-"));
    await writeBuild(out, dir);
    const files = (await readdir(join(dir, out.version))).sort();
    expect(files).toEqual([...out.files.map((f) => f.file), "RELEASE_NOTES.md"].sort());
    const written = manifest.parse(JSON.parse(await readFile(join(dir, "manifest.json"), "utf8")));
    for (const f of out.files)
      expect(sha256(new Uint8Array(await readFile(join(dir, out.version, f.file))))).toBe(
        written.versions[out.version]?.packs[f.name]?.sha256,
      );
  });
});

describe("uploadBuild", () => {
  const out = buildPacks(fixtureInput());
  const record = () => {
    const calls: { path: string; opts: Parameters<PutFn>[2] }[] = [];
    const put: PutFn = async (path, _body, opts) => {
      calls.push({ path, opts });
      return { url: `https://blob.test/${path}` };
    };
    return { calls, put };
  };

  it("packs are immutable with a one-year cache; the manifest is overwritable with a short cache", async () => {
    const { calls, put } = record();
    const sent = await uploadBuild(out, put, { updateManifest: true });
    expect(sent).toContain("content/manifest.json");
    for (const c of calls.filter(
      (x) => x.path.endsWith(".json") && x.path !== "content/manifest.json",
    )) {
      expect(c.opts).toMatchObject({
        allowOverwrite: false,
        cacheControlMaxAge: 31_536_000,
        access: "public",
        addRandomSuffix: false,
      });
    }
    expect(calls.find((c) => c.path === "content/manifest.json")?.opts).toMatchObject({
      allowOverwrite: true,
      cacheControlMaxAge: 300,
    });
  });

  it("a preview upload leaves the production manifest alone and can use its own prefix", async () => {
    const { calls, put } = record();
    const sent = await uploadBuild(out, put, { updateManifest: false, prefix: "preview/pr-12" });
    expect(sent.every((p) => p.startsWith("preview/pr-12/"))).toBe(true);
    expect(calls.some((c) => c.path.endsWith("manifest.json"))).toBe(false);
  });
});

// Runs on a developer machine or CI job that has downloaded the sources (`pnpm content:fetch`).
const haveRaw =
  existsSync(repoPath("data/raw/ne/ne_10m_admin_0_countries.geojson")) &&
  existsSync(repoPath("data/snapshots/wikidata-countries.json"));
describe.skipIf(!haveRaw)("real data (197 countries)", () => {
  it("builds the full set deterministically, with every reference point inside its country", () => {
    const read = (f: string) => JSON.parse(readFileSync(repoPath(f), "utf8"));
    const members = (
      require_yaml(repoPath("content/sets/sovereign-197.yaml")) as {
        members: { code: string; un: boolean }[];
      }
    ).members;
    const input = fixtureInput({
      members,
      ne: {
        "110m": read("data/raw/ne/ne_110m_admin_0_countries.geojson"),
        "50m": read("data/raw/ne/ne_50m_admin_0_countries.geojson"),
        "10m": read("data/raw/ne/ne_10m_admin_0_countries.geojson"),
      },
      wikidata: read("data/snapshots/wikidata-countries.json"),
    });
    const a = buildPacks(input);
    const b = buildPacks(input);
    expect(a.files.map((f) => f.sha256)).toEqual(b.files.map((f) => f.sha256));
    const core = decode(a.files[0]?.bytes as Uint8Array) as { entities: Entity[] };
    expect(core.entities).toHaveLength(197);
    expect(core.entities.filter((e) => e.sets?.includes("un-193"))).toHaveLength(193);
    const idx = indexByCode(input.ne["10m"]);
    const outside = core.entities
      .filter(
        (e) =>
          !pointInsideLargest(
            idx.get(e.id.slice(8))?.geometry as never,
            e.ref_point as [number, number],
          ),
      )
      .map((e) => e.id);
    expect(outside).toEqual([]);
    expect(a.fallback110.length).toBeGreaterThan(20);
  }, 120_000);
});

import { parse } from "yaml";
function require_yaml(path: string): unknown {
  return parse(readFileSync(path, "utf8"), { schema: "core" });
}
void readJson;
