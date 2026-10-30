import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, confirm, placePin, next, type RunState } from "@meridian/fact-pin";
import { factPinResult, saveFactRun } from "../lib/fact-pin/results";
import { newDailySession, type FactSession } from "../lib/fact-pin/session";
import { MeridianDb } from "../lib/storage/db";
import { assembleFactPin } from "../lib/fact-pin/data";
import type { Fact } from "@meridian/schemas";

const fact = (n: number): Fact =>
  ({
    id: `fact:${n}`,
    text: "x",
    answer_label: "Kyoto",
    category: "history",
    era: "modern",
    precision: "city",
    target: { type: "point", coords: [35, 135] },
    tolerance_km: 50,
    reveal: "r",
    sources: [],
    difficulty: 0.5,
    entities: [],
    status: "published",
    reviewed_at: "2026-01-01",
    review_due: null,
    continent: "AS",
  }) as Fact;
const data = assembleFactPin({
  facts: { facts: [fact(1), fact(2)] },
  countries: { entities: [] },
  topology: { type: "Topology", objects: {}, arcs: [] } as never,
});

function finished(lat: number): FactSession {
  const s = { ...newDailySession(DEFAULT_CONFIG, ["fact:1", "fact:2"], "2026-11-01", 0, 0) };
  let run: RunState = { ...s.run, config: { ...s.run.config, mode: "run" } };
  for (const f of data.facts) {
    run = confirm(placePin(run, { lat, lon: 135 }), f, data.areas, 1000);
    run = next(run, 1000);
  }
  return { ...s, kind: "run", run };
}

describe("Fact Pin results", () => {
  it("writes a valid GameResult with per-fact items", () => {
    const r = factPinResult(finished(35), {
      id: "01JD0000000000000000000000",
      contentVersion: "2026.11.0",
      endedAt: 5000,
      now: 2000,
    });
    expect(r.game_id).toBe("fact-pin");
    expect(r.score).toBe(2000);
    expect(r.max_score).toBe(2000);
    expect(r.items).toHaveLength(2);
    expect(r.pb_key).toBeDefined();
  });

  it("keeps only a better personal best", async () => {
    const db = new MeridianDb(`fp-${Math.random()}`);
    const ctx = { contentVersion: "2026.11.0", endedAt: 5000, now: 2000 };
    const worse = factPinResult(finished(40), { id: "01JD0000000000000000000001", ...ctx });
    const better = factPinResult(finished(35), { id: "01JD0000000000000000000002", ...ctx });
    expect((await saveFactRun(db, { result: worse })).pb?.isNew).toBe(true);
    expect((await saveFactRun(db, { result: better })).pb?.isNew).toBe(true);
    expect((await saveFactRun(db, { result: worse })).pb?.isNew).toBe(false);
    expect((await db.pbs.get(better.pb_key as string))?.result_id).toBe(better.id);
  });
});
