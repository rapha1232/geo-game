import { describe, expect, it, vi } from "vitest";
import { axiomSink, createLogger, type LogLine } from "../lib/observability/log";

const setup = (sink: ((lines: LogLine[]) => Promise<void>) | null) => {
  const written: string[] = [];
  const deferred: (() => Promise<void>)[] = [];
  const logger = createLogger({
    sink,
    write: (_level, text) => written.push(text),
    now: () => new Date("2026-11-02T10:00:00Z"),
    defer: (fn) => deferred.push(fn),
    base: { service: "meridian-web", version: "abc1234" },
  });
  return { logger, written, deferred };
};

describe("structured server logs", () => {
  it("writes one JSON line with the base fields and drops undefined values", () => {
    const { logger, written } = setup(null);
    logger.log("info", "api_request", { path: "/api/v1/health", status: 200, extra: undefined });
    expect(JSON.parse(written[0]!)).toEqual({
      _time: "2026-11-02T10:00:00.000Z",
      level: "info",
      event: "api_request",
      service: "meridian-web",
      version: "abc1234",
      path: "/api/v1/health",
      status: 200,
    });
  });
  it("batches lines to the sink once, after the response", async () => {
    const sink = vi.fn(async () => undefined);
    const { logger, deferred } = setup(sink);
    logger.log("info", "a");
    logger.log("warn", "b");
    expect(deferred).toHaveLength(1);
    expect(sink).not.toHaveBeenCalled();
    await deferred[0]!();
    expect(sink).toHaveBeenCalledOnce();
    expect((sink.mock.calls[0] as unknown as [LogLine[]])[0].map((l) => l.event)).toEqual([
      "a",
      "b",
    ]);
  });
  it("never throws when shipping fails; it notes the failure on stderr", async () => {
    const { logger, written, deferred } = setup(async () => Promise.reject(new Error("down")));
    logger.log("error", "boom");
    await expect(deferred[0]!()).resolves.toBeUndefined();
    expect(written.at(-1)).toContain("log_ship_failed");
  });
  it("Axiom is used only when both its token and dataset are set", () => {
    expect(axiomSink({})).toBeNull();
    expect(axiomSink({ AXIOM_TOKEN: "t" })).toBeNull();
    expect(axiomSink({ AXIOM_TOKEN: "t", AXIOM_DATASET: "meridian" })).toBeTypeOf("function");
  });
  it("posts the batch to the dataset's ingest endpoint with the token", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await axiomSink({ AXIOM_TOKEN: "t", AXIOM_DATASET: "meridian logs" })!([
      { _time: "x", level: "info", event: "e" },
    ]);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.axiom.co/v1/datasets/meridian%20logs/ingest");
    expect((init.headers as Record<string, string>)["Authorization"]).toBe("Bearer t");
    vi.unstubAllGlobals();
  });
});
