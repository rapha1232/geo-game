import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { suggest } from "@meridian/silhouette";
import { assemble, type Loaded, type SilhouettePacks } from "../lib/silhouette/data";
import { silhouettePath } from "../lib/silhouette/draw";
import {
  DEFAULT_CONFIG,
  answer,
  followUpsCorrect,
  guess,
  hint,
  newSession,
  next,
  pick,
  points,
  surrender,
  type Session,
} from "../lib/silhouette/controller";

const root = resolve(import.meta.dirname, "../../..");
const haveRaw = existsSync(join(root, "data/raw/ne/ne_10m_admin_0_countries.geojson"));

describe.skipIf(!haveRaw)("Silhouette on the real content packs", () => {
  let data: Loaded;
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
    data = assemble({
      countries: read("core.countries"),
      adjacency: read("core.adjacency"),
      ambiguity: read("core.ambiguity"),
      silhouettes: read("geo.silhouettes"),
    } as SilhouettePacks);
  }, 240_000);

  it("builds the world: 197 entities with a drawable shape each", () => {
    expect(data.world.entities).toHaveLength(197);
    expect(data.shapes.size).toBe(197);
  });

  it("draws every silhouette to a finite SVG path, including shapes across the antimeridian", () => {
    for (const [id, shape] of data.shapes) {
      const d = silhouettePath(shape.main);
      expect(d.length, id).toBeGreaterThan(10);
      expect(d, id).not.toMatch(/NaN|Infinity/);
    }
    for (const id of ["country:FJI", "country:KIR", "country:RUS", "country:USA"])
      expect(silhouettePath(data.shapes.get(id)!.main)).toMatch(/^M/);
  });

  it("France has remote parts and the United States silhouette has Alaska and Hawaii remote", () => {
    expect(data.world.byId.get("country:FRA")!.remote.length).toBeGreaterThanOrEqual(5);
    expect(data.world.byId.get("country:USA")!.remote.length).toBeGreaterThan(5);
    expect(data.shapes.get("country:FRA")!.remote).not.toBeNull();
  });

  it("AC-SH-020: typing 'gre' suggests Greece and Grenada, and 'con' offers both Congos", () => {
    const names = suggest(data.world, "gre").map((e) => e.name);
    expect(names).toEqual(expect.arrayContaining(["Greece", "Grenada"]));
    expect(suggest(data.world, "congo").map((e) => e.name)).toEqual(
      expect.arrayContaining(["DR Congo", "Republic of the Congo"]),
    );
  });

  it("AC-SH-008: typing 'Congo' shows the group message and consumes no guess", () => {
    const s = newSession(data.world, "AAAAAAAAAA");
    const r = guess(data.world, s, "Congo");
    expect(r.round.guesses).toHaveLength(0);
    expect(r.lastEvent).toMatchObject({ kind: "ambiguous" });
  });

  it("AC-SH-009/005: guessing a neighbour whose ref point is far away shows the border marker", () => {
    let s = newSession(data.world, "BBBBBBBBBB");
    s = { ...s, round: { ...s.round, targetId: "country:RUS" } };
    s = guess(data.world, s, "Kazakhstan");
    expect(s.round.guesses[0]).toMatchObject({ entityId: "country:KAZ", sharesBorder: true });
  });

  it("AC-SH-016: after 2 guesses and a reload (JSON round trip) the same target and rows are there, 4 guesses left", () => {
    let s = newSession(data.world, "CCCCCCCCCC");
    const target = s.round.targetId;
    const wrong = data.world.entities.filter((e) => e.id !== target).slice(0, 2);
    s = pick(data.world, s, wrong[0]!.id);
    s = pick(data.world, s, wrong[1]!.id);
    const restored = JSON.parse(JSON.stringify(s)) as Session;
    expect(restored).toEqual(s);
    expect(restored.round.targetId).toBe(target);
    expect(restored.round.guesses).toHaveLength(2);
    const cont = pick(
      data.world,
      restored,
      data.world.entities.filter((e) => e.id !== target)[2]!.id,
    );
    expect(cont.round.guesses).toHaveLength(3);
    expect(6 - cont.round.guesses.length).toBe(3);
  });

  it("plays a full round: guess, follow-ups, learn, next round with a new target", () => {
    let s = newSession(data.world, "DDDDDDDDDD");
    const first = s.round.targetId;
    s = hint(s, 1);
    s = guess(data.world, s, data.world.byId.get(first)!.name);
    expect(s.round.status).toBe("solved");
    expect(s.phase).toBe("followups");
    expect(s.followUps).toHaveLength(2);
    s = answer(s, 0, s.followUps[0]!.prompt.correctIndex);
    s = answer(s, 1, (s.followUps[1]!.prompt.correctIndex + 1) % 4);
    expect(s.phase).toBe("learn");
    expect(followUpsCorrect(s)).toBe(1);
    expect(points(s)).toBe(7 - 1 - 1 + 1);
    s = next(data.world, s);
    expect(s.phase).toBe("guessing");
    expect(s.roundNo).toBe(2);
    expect(s.round.targetId).not.toBe(first);
    expect(s.done).toHaveLength(1);
  });

  it("AC-SH-012: 98 consecutive Unlimited rounds give 98 distinct targets", () => {
    let s = newSession(data.world, "EEEEEEEEEE", { ...DEFAULT_CONFIG, followUps: [] });
    const seen = new Set<string>();
    for (let i = 0; i < 98; i++) {
      seen.add(s.round.targetId);
      s = next(data.world, surrender(data.world, s));
    }
    expect(seen.size).toBe(98);
  });

  it("is deterministic: the same seed gives the same first targets", () => {
    const run = (seed: string) => {
      let s = newSession(data.world, seed, { ...DEFAULT_CONFIG, followUps: [] });
      const ids: string[] = [];
      for (let i = 0; i < 5; i++) {
        ids.push(s.round.targetId);
        s = next(data.world, surrender(data.world, s));
      }
      return ids;
    };
    expect(run("FFFFFFFFFF")).toEqual(run("FFFFFFFFFF"));
    expect(run("FFFFFFFFFF")).not.toEqual(run("GGGGGGGGGG"));
  });

  it("Practice mode has no follow-ups and no points", () => {
    let s = newSession(data.world, "HHHHHHHHHH", { ...DEFAULT_CONFIG, mode: "practice" });
    s = guess(data.world, s, data.world.byId.get(s.round.targetId)!.name);
    expect(s.phase).toBe("learn");
    expect(points(s)).toBe(0);
  });
});
