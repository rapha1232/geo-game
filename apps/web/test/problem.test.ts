import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { ERROR_CODES, ERROR_STATUS, problem } from "@meridian/schemas";
import { ApiError, handle, jsonResponse, problemResponse, readJson } from "../lib/api/problem";

describe("problemResponse", () => {
  it("emits a valid RFC 9457 body for every error code, with the right status and no caching", async () => {
    for (const code of ERROR_CODES) {
      const res = problemResponse(code, { detail: "x" });
      expect(res.status).toBe(ERROR_STATUS[code]);
      expect(res.headers.get("content-type")).toBe("application/problem+json; charset=utf-8");
      expect(res.headers.get("cache-control")).toBe("no-store");
      const body = problem.parse(await res.json());
      expect(body.code).toBe(code);
      expect(body.request_id).toMatch(/^req_[0-9a-f]{32}$/);
    }
  });

  it("carries field errors and extra headers such as Retry-After", async () => {
    const res = problemResponse("RATE_LIMITED", { headers: { "Retry-After": "30" } });
    expect(res.headers.get("retry-after")).toBe("30");
    const v = problemResponse("VALIDATION_FAILED", {
      errors: [{ path: "message", message: "Too short" }],
    });
    expect((await v.json()).errors).toEqual([{ path: "message", message: "Too short" }]);
  });
});

describe("handle", () => {
  const call = async (fn: () => Response | Promise<Response>) => handle(fn)();

  it("passes successful responses through", async () => {
    const res = await call(() => jsonResponse({ ok: true }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("maps a ZodError to 422 with paths", async () => {
    const res = await call(() => {
      z.object({ message: z.string().min(10) }).parse({ message: "short" });
      return jsonResponse({});
    });
    expect(res.status).toBe(422);
    expect((await res.json()).errors[0]).toMatchObject({ path: "message" });
  });

  it("maps bad JSON to 400 and ApiError to its own code", async () => {
    expect((await call(() => new Response(String(JSON.parse("{nope"))))).status).toBe(400);
    const gone = await call(() => {
      throw new ApiError("GONE", { detail: "expired" });
    });
    expect(gone.status).toBe(410);
    expect((await gone.json()).detail).toBe("expired");
  });

  it("hides the cause of unexpected errors and logs it with the request id", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const res = await call(() => {
      throw new Error("password=hunter2 connection refused");
    });
    expect(res.status).toBe(500);
    const text = JSON.stringify(await res.json());
    expect(text).not.toContain("hunter2");
    expect(text).toContain("req_");
    expect(String(log.mock.calls[0]?.[0])).toContain("requestId");
    log.mockRestore();
  });
});

describe("readJson", () => {
  const post = (body: string, headers: Record<string, string> = {}) =>
    new Request("https://x.test/api", { method: "POST", body, headers });

  it("parses JSON within the limit", async () => {
    expect(await readJson(post('{"a":1}'))).toEqual({ a: 1 });
  });

  it("rejects over-limit bodies by header and by actual size", async () => {
    await expect(readJson(post("{}", { "content-length": "999999" }))).rejects.toMatchObject({
      code: "PAYLOAD_TOO_LARGE",
    });
    await expect(readJson(post(JSON.stringify({ pad: "x".repeat(70_000) })))).rejects.toMatchObject(
      { code: "PAYLOAD_TOO_LARGE" },
    );
    expect(
      await readJson(post(JSON.stringify({ pad: "x".repeat(70_000) })), 512 * 1024),
    ).toBeTruthy();
  });

  it("counts bytes, not characters", async () => {
    await expect(readJson(post(JSON.stringify({ s: "é".repeat(40_000) })))).rejects.toMatchObject({
      code: "PAYLOAD_TOO_LARGE",
    });
  });
});
