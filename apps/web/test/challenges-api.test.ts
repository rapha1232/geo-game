import { describe, expect, it } from "vitest";
import { createChallengeResponse, problem } from "@meridian/schemas";
import {
  createChallenge,
  resolveChallenge,
  type ChallengeRow,
  type ChallengeStore,
  type Deps,
} from "../lib/api/challenges";
import { handle } from "../lib/api/problem";
import { isVersionExpired } from "../lib/challenges/games";
import { DEFAULT_CHALLENGE, encodeSilhouetteChallenge } from "../lib/challenges/silhouette";

class MemStore implements ChallengeStore {
  rows = new Map<string, ChallengeRow & { payloadHash: string; uses: number }>();
  async findByHash(hash: string) {
    return [...this.rows.values()].find((r) => r.payloadHash === hash) ?? null;
  }
  async insert(row: ChallengeRow & { payloadHash: string }) {
    if (this.rows.has(row.code)) return false;
    this.rows.set(row.code, { ...row, uses: 0 });
    return true;
  }
  async use(code: string) {
    const r = this.rows.get(code);
    if (!r) return null;
    r.uses++;
    return r;
  }
}

const seeds = ["4KQ2M9XD1A", "7TTTTTTTTT", "0000000001"];
const code = (i = 0, extra: object = {}) =>
  encodeSilhouetteChallenge({
    config: DEFAULT_CHALLENGE,
    seed: seeds[i] as string,
    contentVersion: "2026.10.0",
    ...extra,
  });
const post = (body: unknown) =>
  new Request("https://meridian.example/api/v1/challenges", {
    method: "POST",
    body: JSON.stringify(body),
  });
const deps = (
  store: MemStore | null = new MemStore(),
  bytes = [1, 2, 3, 4, 5],
  now = Date.parse("2026-11-05T00:00:00Z"),
): Deps => ({
  store,
  randomBytes: () => new Uint8Array(bytes),
  now: () => now,
});
const run = (fn: () => Promise<Response>) => handle(fn)();
const good = (payload = code()) => ({
  game_id: "silhouette",
  payload,
  content_version: "2026.10.0",
});

describe("POST /api/v1/challenges (AC-PL-016)", () => {
  it("201 with a short code and a link, and the same payload returns the same code", async () => {
    const d = deps();
    const a = await run(() => createChallenge(post(good()), d));
    expect(a.status).toBe(201);
    const body = createChallengeResponse.parse(await a.json());
    expect(body.code).toMatch(/^SH-[0-9A-Z]{4}-[0-9A-Z]{4}$/);
    expect(body.url).toBe(`https://meridian.example/c/${body.code}`);
    const b = await run(() => createChallenge(post(good()), d));
    expect(b.status).toBe(200);
    expect(createChallengeResponse.parse(await b.json()).code).toBe(body.code);
    expect(d.store && (d.store as MemStore).rows.size).toBe(1);
  });
  it("a different payload gets its own code, even if the random code collides once", async () => {
    const store = new MemStore();
    let n = 0;
    const d = {
      ...deps(store),
      randomBytes: () => new Uint8Array(n++ < 2 ? [9, 9, 9, 9, 9] : [n, n, n, n, n]),
    };
    const a = createChallengeResponse.parse(
      await (await run(() => createChallenge(post(good(code(0))), d))).json(),
    );
    const b = createChallengeResponse.parse(
      await (await run(() => createChallenge(post(good(code(1))), d))).json(),
    );
    expect(a.code).not.toBe(b.code);
    expect(store.rows.size).toBe(2);
  });
  it("422 for a payload that is not a valid challenge, a wrong game, or a mismatched content_version", async () => {
    for (const bad of [
      good("not-a-code"),
      { ...good(), game_id: "quiz" },
      { ...good(), content_version: "2026.09.0" },
      good(
        encodeSilhouetteChallenge({
          config: { ...DEFAULT_CHALLENGE, n: 5 },
          seed: "BADSEED",
          contentVersion: "2026.10.0",
        } as never).slice(0, 5),
      ),
    ]) {
      const res = await run(() => createChallenge(post(bad), deps()));
      expect(res.status).toBe(422);
      expect(problem.parse(await res.json()).code).toBe("VALIDATION_FAILED");
    }
  });
  it("422 for a body that does not match the schema, 400 for broken JSON", async () => {
    expect((await run(() => createChallenge(post({ game_id: "silhouette" }), deps()))).status).toBe(
      422,
    );
    const broken = new Request("https://x/api/v1/challenges", { method: "POST", body: "{nope" });
    expect((await run(() => createChallenge(broken, deps()))).status).toBe(400);
  });
  it("413 for an oversized body and 503 when there is no database", async () => {
    const big = new Request("https://x/api/v1/challenges", {
      method: "POST",
      body: JSON.stringify({ pad: "x".repeat(70_000) }),
    });
    expect((await run(() => createChallenge(big, deps()))).status).toBe(413);
    const res = await run(() => createChallenge(post(good()), deps(null)));
    expect(res.status).toBe(503);
  });
});

describe("GET /api/v1/challenges/{code} (AC-PL-016, AC-PL-017)", () => {
  const stored = async () => {
    const d = deps();
    const c = createChallengeResponse.parse(
      await (await run(() => createChallenge(post(good()), d))).json(),
    ).code;
    return { d, c };
  };
  it("resolves, counts the use, and is case- and dash-insensitive", async () => {
    const { d, c } = await stored();
    for (const form of [c, c.toLowerCase(), c.replaceAll("-", ""), c.replace(/-/g, " ")]) {
      const res = await run(() => resolveChallenge(form, d));
      expect(res.status).toBe(200);
      expect(res.headers.get("cache-control")).toBe("private, max-age=60");
      expect(await res.json()).toEqual(good());
    }
    expect([...(d.store as MemStore).rows.values()][0]?.uses).toBe(4);
  });
  it("404 for an unknown or malformed code", async () => {
    const { d } = await stored();
    for (const c of ["SH-ZZZZ-ZZZZ", "nonsense", ""])
      expect((await run(() => resolveChallenge(c, d))).status).toBe(404);
  });
  it("410 with the same body once the content version has expired", async () => {
    const { d, c } = await stored();
    const later = { ...d, now: () => Date.parse("2027-06-01T00:00:00Z") };
    const res = await run(() => resolveChallenge(c, later));
    expect(res.status).toBe(410);
    expect(await res.json()).toEqual(good());
  });
});

describe("version retention (DATA_AND_CONTENT §8.4)", () => {
  it("expires 180 days after the end of the version's month", () => {
    const at = (s: string) => Date.parse(s);
    expect(isVersionExpired("2026.10.0", at("2027-04-28T00:00:00Z"))).toBe(false);
    expect(isVersionExpired("2026.10.0", at("2027-05-01T00:00:00Z"))).toBe(true);
    expect(isVersionExpired("weird", at("2099-01-01T00:00:00Z"))).toBe(false);
  });
});
