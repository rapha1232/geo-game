import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { makeRng } from "@meridian/game-kit";
import { DEFAULT_CONFIG, newOrderRound, separated, valueOf, type StatDef } from "@meridian/rank-it";
import { assembleRankIt, type LoadedRankIt } from "../lib/rank-it/data";

const root = resolve(import.meta.dirname, "../../..");
const haveRaw = existsSync(join(root, "data/raw/ne/ne_10m_admin_0_countries.geojson"));

describe.skipIf(!haveRaw)("Rank It on the real content packs", () => {
  let data: LoadedRankIt;
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
    data = assembleRankIt({
      countries: read("core.countries"),
      indicators: read("core.indicators"),
    });
  }, 240_000);

  it("AC-RK-004 and AC-RK-012 real rounds respect the separation rule and only use countries with data", () => {
    let history: string[] = [];
    for (const stat of data.world.stats) {
      for (let i = 0; i < 40; i++) {
        const g = newOrderRound(
          data.world,
          { ...DEFAULT_CONFIG, stat: stat.id },
          history,
          makeRng(`real-${stat.id}`, "rank-it", i),
        );
        expect(g).not.toBeNull();
        history = g!.history;
        const def = data.world.statById.get(stat.id) as StatDef;
        const vals = g!.round.truth.map((id) => valueOf(data.world, stat.id, id));
        expect(vals.every((v) => v !== undefined)).toBe(true);
        for (let a = 0; a < 5; a++)
          for (let b = a + 1; b < 5; b++)
            expect(separated(def, vals[a] as number, vals[b] as number)).toBe(true);
      }
    }
  });

  it("the pack has the six statistics with credible values", () => {
    expect(data.world.stats.map((s) => s.id)).toEqual([
      "population",
      "area",
      "density",
      "gdp-per-capita",
      "life-expectancy",
      "capital-latitude",
    ]);
    expect(valueOf(data.world, "population", "country:CHN")).toBeGreaterThan(1.3e9);
    expect(valueOf(data.world, "capital-latitude", "country:ISL")).toBeGreaterThan(60);
    expect(valueOf(data.world, "life-expectancy", "country:JPN")).toBeGreaterThan(80);
  });
});
