import { describe, expect, it, vi } from "vitest";
import { gameResult, type GameResult } from "@meridian/schemas";
import {
  aggregateRows,
  ingestAnswers,
  runAggregate,
  RETENTION_MS,
  type EventRow,
  type Stat,
  type TelemetryStore,
} from "../lib/api/telemetry";
import { RateLimiter } from "../lib/api/rate-limit";
import { handle } from "../lib/api/problem";
import { TelemetryClient } from "../lib/telemetry/client";
import { eventsFromResult } from "../lib/telemetry/events";
import { DEFAULT_SETTINGS, sanitize } from "../lib/settings/settings";

const NOW = Date.UTC(2026, 10, 5, 8, 0, 0);
const hash = "c2f1".repeat(8);
const event = (over: Record<string, unknown> = {}) => ({
  game_id: "silhouette",
  item_kind: "shape",
  item_id: "country:TLS",
  correct: true,
  attempt: 2,
  difficulty_setting: "normal",
  t: new Date(NOW - 1000).toISOString(),
  ...over,
});
const post = (body: unknown) =>
  new Request("https://x.test/api/v1/telemetry/answers", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "1.2.3.4" },
    body: JSON.stringify(body),
  });

class MemStore implements TelemetryStore {
  events: (EventRow & { done?: boolean })[] = [];
  stats = new Map<string, Stat>();
  async insertMany(rows: readonly EventRow[]) {
    this.events.push(...rows);
  }
  async takePending(limit: number) {
    const rows = this.events.filter((e) => !e.done).slice(0, limit);
    for (const r of rows) r.done = true;
    return rows;
  }
  async getStats(keys: readonly { itemKind: string; itemId: string; promptId: string }[]) {
    return keys.flatMap((k) => this.stats.get(`${k.itemKind}|${k.itemId}|${k.promptId}`) ?? []);
  }
  async putStats(stats: readonly Stat[]) {
    for (const s of stats) this.stats.set(`${s.itemKind}|${s.itemId}|${s.promptId}`, s);
  }
  async deleteBefore(cutoff: number) {
    const before = this.events.length;
    this.events = this.events.filter((e) => e.occurredAt >= cutoff);
    return before - this.events.length;
  }
}
const deps = (
  store: TelemetryStore | null = new MemStore(),
  limiter = new RateLimiter([{ limit: 120, windowSeconds: 60 }]),
) => ({
  store,
  limiter,
  now: () => NOW,
});
const call = (body: unknown, d = deps()) => handle(() => ingestAnswers(post(body), d))();

describe("POST /api/v1/telemetry/answers", () => {
  it("accepts a batch with 204 and stores nothing that identifies the sender", async () => {
    const store = new MemStore();
    const res = await call(
      { session_hash: hash, content_version: "2026.11.0", events: [event()] },
      deps(store),
    );
    expect(res.status).toBe(204);
    expect(store.events).toHaveLength(1);
    expect(JSON.stringify(store.events[0])).not.toContain("1.2.3.4");
    expect(store.events[0]).toMatchObject({ sessionHash: hash, itemId: "country:TLS", attempt: 2 });
  });

  it("rejects more than 100 events, a bad session hash and an unknown game", async () => {
    const many = Array.from({ length: 101 }, () => event());
    expect((await call({ session_hash: hash, content_version: "v", events: many })).status).toBe(
      422,
    );
    expect(
      (await call({ session_hash: "short", content_version: "v", events: [event()] })).status,
    ).toBe(422);
    expect(
      (
        await call({
          session_hash: hash,
          content_version: "v",
          events: [event({ game_id: "nope" })],
        })
      ).status,
    ).toBe(422);
  });

  it("replaces a timestamp far from the server clock with the server's", async () => {
    const store = new MemStore();
    await call(
      {
        session_hash: hash,
        content_version: "v",
        events: [event({ t: "2020-01-01T00:00:00.000Z" })],
      },
      deps(store),
    );
    expect(store.events[0]?.occurredAt).toBe(NOW);
  });

  it("answers 429 with Retry-After beyond the limit and 503 without a database", async () => {
    const limiter = new RateLimiter([{ limit: 1, windowSeconds: 60 }]);
    const d = deps(new MemStore(), limiter);
    const body = { session_hash: hash, content_version: "v", events: [event()] };
    expect((await call(body, d)).status).toBe(204);
    const limited = await call(body, d);
    expect(limited.status).toBe(429);
    expect(limited.headers.get("Retry-After")).toBeTruthy();
    expect((await call(body, deps(null))).status).toBe(503);
  });
});

describe("aggregation", () => {
  const row = (over: Partial<EventRow> = {}): EventRow => ({
    occurredAt: NOW,
    sessionHash: hash,
    gameId: "deep-cut",
    itemKind: "prompt_answer",
    itemId: "country:TLS",
    promptId: "prompt:lang",
    answerEntityId: null,
    correct: true,
    attempt: 1,
    difficultySetting: "normal",
    contentVersion: "v",
    ...over,
  });

  it("counts n, first-attempt successes and wrong picks per item", () => {
    const [s] = aggregateRows(
      [
        row(),
        row({ correct: false, answerEntityId: "country:PRT" }),
        row({ attempt: 2 }),
        row({ correct: false, answerEntityId: "country:PRT" }),
      ],
      new Map(),
    );
    expect(s).toMatchObject({ n: 4, correctFirst: 1, pickCounts: { "country:PRT": 2 } });
  });

  it("adds to the totals already stored", async () => {
    const store = new MemStore();
    await store.insertMany([row(), row()]);
    await runAggregate(store, NOW);
    await store.insertMany([row({ correct: false })]);
    await runAggregate(store, NOW);
    expect(store.stats.get("prompt_answer|country:TLS|prompt:lang")).toMatchObject({
      n: 3,
      correctFirst: 2,
    });
  });

  it("deletes raw events older than 90 days", async () => {
    const store = new MemStore();
    await store.insertMany([row({ occurredAt: NOW - RETENTION_MS - 1000 }), row()]);
    await runAggregate(store, NOW);
    expect(store.events).toHaveLength(1);
  });
});

describe("client", () => {
  const result = (over: Record<string, unknown> = {}): GameResult =>
    gameResult.parse({
      id: "01J00000000000000000000000",
      game_id: "silhouette",
      mode: "unlimited",
      config: { difficulty: "hard" },
      config_hash: "h",
      seed: "SEED000001",
      content_version: "2026.10.0",
      score: 5,
      max_score: 8,
      outcome: "solved",
      items: [
        { item_id: "target", entity_id: "country:FRA", status: "correct", attempts: 3 },
        { item_id: "followup:capital", status: "wrong" },
        { item_id: "followup:flag", status: "skipped" },
      ],
      flags: { resumed: false, pauseCount: 0, assisted: false, guardRelaxed: false, attempt: 1 },
      started_at: "2026-11-05T08:00:00.000Z",
      ended_at: "2026-11-05T08:01:00.000Z",
      active_ms: 1000,
      ...over,
    });

  it("is off by default", () => {
    expect(DEFAULT_SETTINGS.telemetry).toBe(false);
    expect(sanitize({ telemetry: "yes" }).telemetry).toBe(false);
  });

  it("turns a round into per-item outcomes only", () => {
    const ev = eventsFromResult(result());
    expect(
      ev.map((e) => [e.item_kind, e.item_id, e.correct, e.attempt, e.difficulty_setting]),
    ).toEqual([
      ["shape", "country:FRA", true, 3, "hard"],
      ["capital", "country:FRA", false, 1, "hard"],
    ]);
    expect(JSON.stringify(ev)).not.toContain("SEED");
  });

  it("sends nothing for practice rounds or games that do not calibrate", () => {
    expect(eventsFromResult(result({ mode: "practice" }))).toEqual([]);
    expect(eventsFromResult(result({ game_id: "rank-it" }))).toEqual([]);
  });

  it("AC-PL-033 with telemetry off, nothing is queued and no call is made", async () => {
    const send = vi.fn();
    let on = false;
    const c = new TelemetryClient(() => on, send);
    await c.enqueue("v", eventsFromResult(result()));
    await c.flush();
    expect(c.pending).toBe(0);
    expect(send).not.toHaveBeenCalled();
    on = true;
    await c.enqueue("v", eventsFromResult(result()));
    expect(c.pending).toBe(2);
    on = false;
    await c.flush();
    expect(send).not.toHaveBeenCalled();
    expect(c.pending).toBe(0);
  });

  it("sends enabled events in batches of at most 100 with one random session hash", async () => {
    const send = vi.fn();
    const c = new TelemetryClient(() => true, send);
    const ev = eventsFromResult(result());
    await c.enqueue(
      "2026.10.0",
      Array.from({ length: 150 }, () => ev[0]!),
    );
    await c.flush();
    expect(send).toHaveBeenCalledTimes(2);
    const bodies = send.mock.calls.map((a) => JSON.parse(a[1] as string));
    expect(bodies.map((b) => b.events.length)).toEqual([100, 50]);
    expect(bodies[0].session_hash).toMatch(/^[0-9a-f]{32}$/);
    expect(bodies[0].session_hash).toBe(bodies[1].session_hash);
    expect(send.mock.calls[0]![0]).toBe("/api/v1/telemetry/answers");
  });
});
