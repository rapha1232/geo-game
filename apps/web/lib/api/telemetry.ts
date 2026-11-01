import { telemetryRequest, type TelemetryEvent } from "@meridian/schemas";
import { ApiError, readJson } from "./problem";
import { clientIp } from "./reports";
import type { RateLimiter } from "./rate-limit";

export type EventRow = {
  occurredAt: number;
  sessionHash: string;
  gameId: string;
  itemKind: string;
  itemId: string;
  promptId: string | null;
  answerEntityId: string | null;
  correct: boolean;
  attempt: number;
  difficultySetting: string;
  contentVersion: string;
};

export type StatKey = { itemKind: string; itemId: string; promptId: string };
export type Stat = StatKey & {
  n: number;
  correctFirst: number;
  pickCounts: Record<string, number>;
};

/** Storage seam: the Neon implementation is in `telemetry-store.ts`; tests use an in-memory one. */
export interface TelemetryStore {
  insertMany(rows: readonly EventRow[]): Promise<void>;
  /** Marks up to `limit` pending events as aggregated and returns them. */
  takePending(limit: number): Promise<EventRow[]>;
  getStats(keys: readonly StatKey[]): Promise<Stat[]>;
  putStats(stats: readonly Stat[]): Promise<void>;
  /** Deletes raw events older than the cutoff (90 days). */
  deleteBefore(cutoffMs: number): Promise<number>;
}

export type TelemetryDeps = {
  store: TelemetryStore | null;
  limiter: RateLimiter;
  now: () => number;
};

export const RETENTION_MS = 90 * 86_400_000;
const SKEW_MS = 24 * 3_600_000;

/** An event's time is the client's, so a clock far from ours is replaced by ours. */
const when = (e: TelemetryEvent, nowMs: number): number => {
  const t = Date.parse(e.t);
  return Math.abs(t - nowMs) > SKEW_MS ? nowMs : t;
};

/**
 * `POST /api/v1/telemetry/answers` (API_CONTRACTS §4.6). Public and anonymous: no session is read, no IP or user agent is
 * stored, and the only identifier is a random per-play-session hash. Answers 204.
 */
export async function ingestAnswers(req: Request, deps: TelemetryDeps): Promise<Response> {
  const wait = deps.limiter.take(clientIp(req), deps.now());
  if (wait > 0)
    throw new ApiError("RATE_LIMITED", {
      detail: "Too many requests.",
      headers: { "Retry-After": String(wait) },
    });
  const body = telemetryRequest.parse(await readJson(req));
  if (!deps.store) throw new ApiError("UNAVAILABLE", { detail: "Not available right now." });
  const now = deps.now();
  await deps.store.insertMany(
    body.events.map((e) => ({
      occurredAt: when(e, now),
      sessionHash: body.session_hash,
      gameId: e.game_id,
      itemKind: e.item_kind,
      itemId: e.item_id,
      promptId: e.prompt_id ?? null,
      answerEntityId: e.answer_entity_id ?? null,
      correct: e.correct,
      attempt: e.attempt,
      difficultySetting: e.difficulty_setting,
      contentVersion: body.content_version,
    })),
  );
  await maybeAggregate(deps.store, now);
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}

/** Rolls raw events into per-item counts: n, first-attempt successes and how often each wrong answer was picked. */
export function aggregateRows(
  rows: readonly EventRow[],
  existing: ReadonlyMap<string, Stat>,
): Stat[] {
  const key = (r: StatKey): string => `${r.itemKind}|${r.itemId}|${r.promptId}`;
  const out = new Map<string, Stat>();
  for (const r of rows) {
    const k: StatKey = { itemKind: r.itemKind, itemId: r.itemId, promptId: r.promptId ?? "" };
    const cur =
      out.get(key(k)) ??
      (() => {
        const prev = existing.get(key(k));
        const s: Stat = {
          ...k,
          n: prev?.n ?? 0,
          correctFirst: prev?.correctFirst ?? 0,
          pickCounts: { ...(prev?.pickCounts ?? {}) },
        };
        out.set(key(k), s);
        return s;
      })();
    cur.n += 1;
    if (r.correct && r.attempt === 1) cur.correctFirst += 1;
    if (r.answerEntityId)
      cur.pickCounts[r.answerEntityId] = (cur.pickCounts[r.answerEntityId] ?? 0) + 1;
  }
  return [...out.values()];
}

const AGGREGATE_EVERY_MS = 3_600_000;
const BATCH = 2000;
let lastAggregate = 0;

/**
 * There is no cron on the free plan, so the nightly roll-up runs on ingest instead: at most hourly per warm instance. It
 * also deletes raw events older than 90 days. A failure never fails the request.
 */
export async function maybeAggregate(store: TelemetryStore, nowMs: number): Promise<void> {
  if (nowMs - lastAggregate < AGGREGATE_EVERY_MS) return;
  lastAggregate = nowMs;
  try {
    await runAggregate(store, nowMs);
  } catch {
    lastAggregate = 0;
  }
}

export async function runAggregate(store: TelemetryStore, nowMs: number): Promise<number> {
  let total = 0;
  for (;;) {
    const rows = await store.takePending(BATCH);
    if (rows.length === 0) break;
    const keys = [
      ...new Map(
        rows.map((r) => [
          `${r.itemKind}|${r.itemId}|${r.promptId ?? ""}`,
          { itemKind: r.itemKind, itemId: r.itemId, promptId: r.promptId ?? "" },
        ]),
      ).values(),
    ];
    const have = await store.getStats(keys);
    await store.putStats(
      aggregateRows(rows, new Map(have.map((s) => [`${s.itemKind}|${s.itemId}|${s.promptId}`, s]))),
    );
    total += rows.length;
    if (rows.length < BATCH) break;
  }
  await store.deleteBefore(nowMs - RETENTION_MS);
  return total;
}
