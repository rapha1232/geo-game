import { describe, expect, it, vi } from "vitest";
import { RateLimiter } from "../lib/api/rate-limit";
import { MAX_ENVELOPE_BYTES, forwardEnvelope } from "../lib/observability/tunnel";

const DSN = "https://abc123@o42.ingest.sentry.io/4567";
const envelope = (dsn: string, extra = "") =>
  `${JSON.stringify({ dsn, sent_at: "2026-11-02T10:00:00Z" })}\n{"type":"event"}\n{"message":"x"}${extra}`;
const post = (body: string, headers: Record<string, string> = {}) =>
  new Request("https://meridian.test/monitoring", {
    method: "POST",
    body,
    headers: { "x-forwarded-for": "203.0.113.9", ...headers },
  });
const deps = (over = {}) => ({
  dsn: DSN,
  fetch: vi.fn(async () => new Response(null, { status: 200 })) as unknown as typeof fetch,
  limiter: new RateLimiter([{ limit: 60, windowSeconds: 60 }]),
  now: () => 0,
  ...over,
});

describe("Sentry tunnel (AC-PL-003: errors leave through our own origin)", () => {
  it("forwards an envelope for our DSN to that project's envelope endpoint", async () => {
    const d = deps();
    const res = await forwardEnvelope(post(envelope(DSN)), d);
    expect(res.status).toBe(200);
    const [url, init] = (d.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(url).toBe("https://o42.ingest.sentry.io/api/4567/envelope/");
    expect(init.method).toBe("POST");
  });
  it("refuses envelopes for any other DSN, so it cannot relay to someone else's project", async () => {
    const d = deps();
    expect(
      (await forwardEnvelope(post(envelope("https://k@o1.ingest.sentry.io/1")), d)).status,
    ).toBe(403);
    expect((await forwardEnvelope(post(envelope("https://k@evil.example/4567")), d)).status).toBe(
      403,
    );
    expect(d.fetch).not.toHaveBeenCalled();
  });
  it("rejects malformed and oversized bodies, and does nothing without a DSN", async () => {
    expect((await forwardEnvelope(post("not json\n{}"), deps())).status).toBe(400);
    const big = envelope(DSN, "x".repeat(MAX_ENVELOPE_BYTES));
    expect((await forwardEnvelope(post(big), deps())).status).toBe(413);
    const off = deps({ dsn: undefined });
    expect((await forwardEnvelope(post(envelope(DSN)), off)).status).toBe(204);
    expect(off.fetch).not.toHaveBeenCalled();
  });
  it("rate-limits per IP", async () => {
    const d = deps({ limiter: new RateLimiter([{ limit: 1, windowSeconds: 60 }]) });
    expect((await forwardEnvelope(post(envelope(DSN)), d)).status).toBe(200);
    expect((await forwardEnvelope(post(envelope(DSN)), d)).status).toBe(429);
  });
});
