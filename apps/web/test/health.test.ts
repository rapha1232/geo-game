import { describe, expect, it } from "vitest";
import { healthResponse } from "@meridian/schemas";
import { checkHealth } from "../lib/api/health";

const base = { contentVersion: "2026.11.0", appVersion: "abc1234" };

describe("GET /api/v1/health", () => {
  it("200 with db ok when the database answers", async () => {
    const res = await checkHealth({ ...base, pingDb: async () => undefined });
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(healthResponse.parse(await res.json())).toEqual({
      status: "ok",
      db: "ok",
      content_version: "2026.11.0",
      app_version: "abc1234",
    });
  });

  it("503 with db down when the database errors", async () => {
    const res = await checkHealth({
      ...base,
      pingDb: async () => Promise.reject(new Error("refused")),
    });
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ status: "degraded", db: "down" });
  });

  it("503 when the database does not answer in time, and does not hang", async () => {
    const t0 = Date.now();
    const res = await checkHealth({
      ...base,
      timeoutMs: 50,
      pingDb: () => new Promise<void>(() => undefined),
    });
    expect(res.status).toBe(503);
    expect(Date.now() - t0).toBeLessThan(1000);
  });

  it("reports a null content version before the first release", async () => {
    const res = await checkHealth({ ...base, contentVersion: null, pingDb: async () => undefined });
    expect((await res.json()).content_version).toBeNull();
  });
});
