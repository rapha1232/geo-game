import "fake-indexeddb/auto";
import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { ContentError, ContentLoader } from "../lib/content/loader";
import { MeridianDb } from "../lib/storage/db";

const body = JSON.stringify({ hello: "world" });
const sha = createHash("sha256").update(body).digest("hex");
const manifest = {
  current: "2026.10.0",
  versions: {
    "2026.10.0": {
      released_at: "2026-10-30T00:00:00Z",
      packs: {
        "core.countries": {
          url: "content/2026.10.0/core.countries.json",
          bytes: body.length,
          sha256: sha,
        },
      },
      licenses: ["ne:PD"],
      notes_url: "content/2026.10.0/RELEASE_NOTES.md",
    },
  },
};
const fake = (packBody = body) =>
  vi.fn(async (url: string | URL | Request) => {
    const u = String(url);
    if (u.endsWith("manifest.json")) return new Response(JSON.stringify(manifest));
    if (u.endsWith("core.countries.json")) return new Response(packBody);
    return new Response("nope", { status: 404 });
  }) as unknown as typeof fetch & ReturnType<typeof vi.fn>;

describe("ContentLoader", () => {
  it("loads, verifies and caches a pack; the second load is served from IndexedDB", async () => {
    const db = new MeridianDb("content-a");
    const f = fake();
    const l = new ContentLoader({ host: "", db, fetcher: f });
    expect(await l.pack("core.countries")).toEqual({ hello: "world" });
    const calls = (f as unknown as ReturnType<typeof vi.fn>).mock.calls.length;
    const l2 = new ContentLoader({ host: "", db, fetcher: f });
    expect(await l2.pack("core.countries")).toEqual({ hello: "world" });
    // only the manifest was fetched again
    expect((f as unknown as ReturnType<typeof vi.fn>).mock.calls.length).toBe(calls + 1);
  });
  it("rejects a pack whose hash does not match the manifest", async () => {
    const l = new ContentLoader({
      host: "",
      db: new MeridianDb("content-b"),
      fetcher: fake('{"tampered":1}'),
    });
    await expect(l.pack("core.countries")).rejects.toMatchObject({ kind: "integrity" });
  });
  it("reports network failures as a typed error and retries on the next call", async () => {
    let fail = true;
    const f = vi.fn(async () => {
      if (fail) throw new TypeError("offline");
      return new Response(JSON.stringify(manifest));
    }) as unknown as typeof fetch;
    const l = new ContentLoader({ host: "", db: null, fetcher: f });
    await expect(l.manifest()).rejects.toBeInstanceOf(ContentError);
    fail = false;
    await expect(l.manifest()).resolves.toMatchObject({ current: "2026.10.0" });
  });
  it("shares one in-flight request between concurrent callers", async () => {
    const f = fake();
    const l = new ContentLoader({ host: "", db: null, fetcher: f });
    await Promise.all([l.pack("core.countries"), l.pack("core.countries")]);
    expect((f as unknown as ReturnType<typeof vi.fn>).mock.calls.length).toBe(2); // manifest + pack
  });
});
