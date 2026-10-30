import { describe, expect, it } from "vitest";
import { createReportResponse, problem } from "@meridian/schemas";
import { handle } from "../lib/api/problem";
import { RateLimiter } from "../lib/api/rate-limit";
import {
  createReport,
  findDuplicates,
  runDedupe,
  type DedupeRow,
  type ReportRow,
  type ReportStore,
} from "../lib/api/reports";

class MemStore implements ReportStore {
  rows: (ReportRow & { id: string; status: string; at: number; duplicateOf?: string })[] = [];
  async insert(row: ReportRow) {
    const r = {
      ...row,
      id: `00000000-0000-4000-8000-${String(this.rows.length).padStart(12, "0")}`,
      status: "new",
      at: this.rows.length,
    };
    this.rows.push(r);
    return { id: r.id, status: r.status };
  }
  async listForDedupe(): Promise<DedupeRow[]> {
    return this.rows
      .filter((r) => r.status !== "duplicate" && r.targetRef)
      .map((r) => ({
        id: r.id,
        createdAt: r.at,
        targetRef: r.targetRef as string,
        category: r.category,
        message: r.message,
      }));
  }
  async markDuplicate(id: string, of: string) {
    const r = this.rows.find((x) => x.id === id);
    if (r) Object.assign(r, { status: "duplicate", duplicateOf: of });
  }
}

const body = (extra: object = {}) => ({
  category: "answer_rejected",
  message: "Typing 'Cabo Verde' should be accepted for Cape Verde.",
  target_ref: "country:CPV",
  context: {
    game_id: "quiz",
    seed: "K7Q2M9XD1A",
    input: "cabo verde",
    content_version: "2026.11.0",
  },
  ...extra,
});
const post = (payload: unknown, ip = "1.2.3.4") =>
  new Request("http://x/api/v1/reports", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify(payload),
  });
const make = (
  store: MemStore | null = new MemStore(),
  limiter = new RateLimiter([
    { limit: 10, windowSeconds: 60 },
    { limit: 50, windowSeconds: 86_400 },
  ]),
) => {
  let now = 1_000_000;
  const deps = { store, limiter, now: () => now };
  return {
    deps,
    store,
    advance: (ms: number) => (now += ms),
    call: handle((r: Request) => createReport(r, deps)),
  };
};

describe("POST /api/v1/reports", () => {
  it("AC-PL-018: answers 202 and stores the context", async () => {
    const { call, store } = make();
    const res = await call(post(body()));
    expect(res.status).toBe(202);
    expect(createReportResponse.parse(await res.json()).status).toBe("new");
    expect(store?.rows[0]).toMatchObject({ targetRef: "country:CPV", contentVersion: "2026.11.0" });
    expect(store?.rows[0]?.context).toMatchObject({ seed: "K7Q2M9XD1A", input: "cabo verde" });
  });

  it("AC-PL-018: the 11th report within a minute from one IP gets 429 with Retry-After", async () => {
    const { call, advance } = make();
    for (let i = 0; i < 10; i++) expect((await call(post(body()))).status).toBe(202);
    const res = await call(post(body()));
    expect(res.status).toBe(429);
    expect(Number(res.headers.get("Retry-After"))).toBeGreaterThan(0);
    expect(problem.parse(await res.json()).code).toBe("RATE_LIMITED");
    expect((await call(post(body(), "9.9.9.9"))).status).toBe(202);
    advance(61_000);
    expect((await call(post(body()))).status).toBe(202);
  });

  it("limits 50 a day", async () => {
    const { call, advance } = make();
    for (let i = 0; i < 50; i++) {
      expect((await call(post(body()))).status).toBe(202);
      advance(7_000);
    }
    expect((await call(post(body()))).status).toBe(429);
  });

  it("rejects a short message, a bad email and oversized context", async () => {
    const { call } = make();
    expect((await call(post(body({ message: "too short" })))).status).toBe(422);
    expect((await call(post(body({ reporter_email: "nope" })))).status).toBe(422);
    expect((await call(post(body({ context: { blob: "x".repeat(5000) } })))).status).toBe(422);
  });

  it("answers 503 when no database is configured", async () => {
    const { call } = make(null);
    expect((await call(post(body()))).status).toBe(503);
  });
});

describe("report dedupe", () => {
  const row = (
    id: string,
    at: number,
    message: string,
    target = "country:CPV",
    category = "answer_rejected",
  ): DedupeRow => ({ id, createdAt: at, targetRef: target, category, message });

  it("marks later similar reports of the same target and category as duplicates of the first", () => {
    const d = findDuplicates([
      row("b", 2, "Cabo Verde should be accepted for Cape Verde"),
      row("a", 1, "Typing Cabo Verde should be accepted for Cape Verde."),
      row("c", 3, "Cabo Verde should be accepted please"),
      row("d", 4, "Totally different complaint about the flag colours", "country:CPV"),
      row("e", 5, "Cabo Verde should be accepted for Cape Verde", "country:FRA"),
    ]);
    expect(d).toEqual([
      { id: "b", of: "a" },
      { id: "c", of: "a" },
    ]);
  });

  it("the job marks them in the store and is idempotent", async () => {
    const store = new MemStore();
    for (const m of [
      "Cabo Verde should be accepted for Cape Verde",
      "Cabo Verde should be accepted for Cape Verde please",
    ])
      await store.insert({
        category: "answer_rejected",
        message: m,
        targetRef: "country:CPV",
        context: {},
        contentVersion: "v",
        reporterEmail: null,
      });
    expect(await runDedupe(store, 0)).toBe(1);
    expect(store.rows[1]).toMatchObject({ status: "duplicate", duplicateOf: store.rows[0]?.id });
    expect(await runDedupe(store, 0)).toBe(0);
  });
});
