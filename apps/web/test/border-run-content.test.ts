import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { makeRng } from "@meridian/game-kit";
import {
  DEFAULT_CONFIG as ENGINE,
  distances,
  pairPool,
  pathLength,
  selectPair,
  shortestPaths,
  startRound,
  submitGuess,
} from "@meridian/border-run";
import {
  assembleBorderRun,
  type BorderRunPacks,
  type LoadedBorderRun,
} from "../lib/border-run/data";

const root = resolve(import.meta.dirname, "../../..");
const haveRaw = existsSync(join(root, "data/raw/ne/ne_10m_admin_0_countries.geojson"));
const c = (iso: string): string => `country:${iso}`;

describe.skipIf(!haveRaw)("Border Run on the real content packs", () => {
  let data: LoadedBorderRun;
  beforeAll(() => {
    const out = mkdtempSync(join(tmpdir(), "meridian-content-"));
    execFileSync(
      "pnpm",
      ["--filter", "@meridian/content-pipeline", "content:build", "--", "--out", out],
      { cwd: root, stdio: "ignore" },
    );
    const manifest = JSON.parse(readFileSync(join(out, "manifest.json"), "utf8"));
    const packs = manifest.versions[manifest.current].packs as Record<string, { url: string }>;
    const read = (name: string) =>
      JSON.parse(
        readFileSync(
          join(out, (packs[name] as { url: string }).url.replace(/^content\//, "")),
          "utf8",
        ),
      );
    data = assembleBorderRun({
      countries: read("core.countries"),
      adjacency: read("core.adjacency"),
      crossings: read("core.crossings"),
      ambiguity: read("core.ambiguity"),
      topology: read("geo.world.110m"),
    } as BorderRunPacks);
  }, 240_000);

  it("AC-BR-001 Spain to Poland is three borders, with France and Germany between", () => {
    const g = data.bw(false).graph;
    expect(pathLength(g, c("ESP"), c("POL"))).toBe(3);
    expect(shortestPaths(g, c("ESP"), c("POL"))[0]).toEqual([
      c("ESP"),
      c("FRA"),
      c("DEU"),
      c("POL"),
    ]);
  });

  it("AC-BR-003 Italy is off route and Switzerland is close for Spain to Poland", () => {
    const w = data.bw(false);
    const s = startRound(w, { a: c("ESP"), b: c("POL"), mode: "unlimited", config: ENGINE });
    const italy = submitGuess(w, s, "Italy").state;
    const swiss = submitGuess(w, italy, "Switzerland").state;
    expect(swiss.guesses.map((x) => x.cls)).toEqual(["off-route", "near"]);
  });

  it("AC-BR-007 France borders Brazil and Suriname through French Guiana", () => {
    const g = data.bw(false).graph;
    expect(g.get(c("BRA"))).toContain(c("FRA"));
    expect(g.get(c("SUR"))).toContain(c("FRA"));
  });

  it("AC-BR-009 the United Kingdom reaches Belgium in two hops via France only with crossings on", () => {
    expect(pathLength(data.bw(false).graph, c("GBR"), c("BEL"))).toBeNull();
    const on = data.bw(true).graph;
    expect(pathLength(on, c("GBR"), c("BEL"))).toBe(2);
    expect(shortestPaths(on, c("GBR"), c("BEL"))[0]).toEqual([c("GBR"), c("FRA"), c("BEL")]);
  });

  it("AC-BR-008 over 10,000 generated rounds no endpoint is in an isolated component", () => {
    const g = data.bw(false).graph;
    const isolated = new Set([...g.keys()].filter((id) => distances(g, id).size === 1));
    expect(isolated.size).toBeGreaterThan(10);
    expect(isolated.has(c("JPN"))).toBe(true);
    let n = 0;
    for (const route of ["easy", "normal", "hard"] as const) {
      const pool = pairPool(g, { ...ENGINE, route }, data.continentOf);
      expect(pool.length).toBeGreaterThan(300);
      const rng = makeRng("coverage", "border-run", route);
      let history: readonly string[] = [];
      for (let i = 0; i < 3400; i++) {
        const p = selectPair(pool, history, rng);
        history = p.history;
        expect(isolated.has(p.a) || isolated.has(p.b)).toBe(false);
        n++;
      }
    }
    expect(n).toBeGreaterThan(10_000);
  });

  it("the world graph yields over 10,000 pairs across the three lengths", () => {
    const g = data.bw(false).graph;
    const total = (["easy", "normal", "hard"] as const)
      .map((route) => pairPool(g, { ...ENGINE, route }, data.continentOf).length)
      .reduce((a, b) => a + b, 0);
    expect(total).toBeGreaterThan(10_000);
  });
});
