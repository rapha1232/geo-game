import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { elapsedMs, newTimer, pauseTimer, restoreTimer, startTimer } from "@meridian/game-kit";
import { MeridianDb, type SessionRecord } from "../lib/storage/db";
import { RESUME_WINDOW_MS, SessionStore, SNAPSHOT_PREFIX } from "../lib/storage/session-store";

const DAY = 24 * 60 * 60 * 1000;
const T0 = 1_800_000_000_000;

class MemStorage {
  m = new Map<string, string>();
  get length() {
    return this.m.size;
  }
  key = (i: number) => [...this.m.keys()][i] ?? null;
  getItem = (k: string) => this.m.get(k) ?? null;
  setItem = (k: string, v: string) => void this.m.set(k, v);
  removeItem = (k: string) => void this.m.delete(k);
}

const rec = (over: Partial<SessionRecord> = {}): SessionRecord => ({
  game_id: "quiz",
  seq: 1,
  updated_at: T0,
  content_version: "2026.10.0",
  title: "Countries of the World",
  href: "/play/quiz/countries-of-the-world",
  state: { n: 1 },
  ...over,
});

let dbn = 0;
let now = T0;
function make(local: MemStorage | null = new MemStorage(), onStatus?: (s: string) => void) {
  const db = new MeridianDb(`test-${dbn++}`);
  const store = new SessionStore({
    db,
    local,
    now: () => now,
    debounceMs: 250,
    onStatus: onStatus as ((s: "ok" | "unavailable") => void) | undefined,
  });
  return { db, store, local };
}

beforeEach(() => {
  now = T0;
  vi.useRealTimers();
});

describe("AC-PL-012 interrupted session", () => {
  it("restores state after a reload and the timer is within ±1 s", async () => {
    let timer = startTimer(newTimer(), 1_000);
    timer = pauseTimer(timer, 61_000); // pagehide: timer paused at 60 s
    const a = make();
    a.store.save(rec({ state: { timer, score: 12 } }));
    await a.store.flush();
    // "Reload": a new store over the same database and storage.
    const store2 = new SessionStore({ db: a.db, local: a.local, now: () => now });
    const found = await store2.find("quiz");
    const restored = restoreTimer((found!.state as { timer: { elapsedMs: number } }).timer);
    expect(Math.abs(elapsedMs(restored, 500_000) - 60_000)).toBeLessThanOrEqual(1000);
    expect((found!.state as { score: number }).score).toBe(12);
  });

  it("uses the localStorage snapshot when IndexedDB never got the last write (pagehide)", async () => {
    const a = make();
    a.store.save(rec({ seq: 1 }));
    await a.store.flush();
    a.store.save(rec({ seq: 2, state: { n: 2 } })); // debounce timer lost with the page
    const fresh = new SessionStore({ db: a.db, local: a.local, now: () => now });
    expect((await fresh.find("quiz"))?.seq).toBe(2);
  });

  it("prefers IndexedDB when it is newer than the snapshot", async () => {
    const a = make();
    a.local!.setItem(SNAPSHOT_PREFIX + "quiz", JSON.stringify(rec({ seq: 1 })));
    await a.db.sessions.put(rec({ seq: 5 }));
    expect((await a.store.find("quiz"))?.seq).toBe(5);
  });

  it("debounces IndexedDB writes to 250 ms", async () => {
    vi.useFakeTimers();
    const a = make();
    const put = vi.spyOn(a.db.sessions, "put");
    for (let i = 1; i <= 5; i++) a.store.save(rec({ seq: i }));
    expect(put).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(260);
    expect(put).toHaveBeenCalledTimes(1);
    expect(put.mock.calls[0]?.[0]?.seq).toBe(5);
  });
});

describe("AC-PL-013 Continue card window", () => {
  it("lists a 6-day-old session and not an 8-day-old one", async () => {
    const a = make();
    await a.db.sessions.bulkPut([
      rec({ game_id: "silhouette", updated_at: T0 - 6 * DAY }),
      rec({ game_id: "quiz", updated_at: T0 - 8 * DAY }),
    ]);
    const ids = (await a.store.listResumable()).map((r) => r.game_id);
    expect(ids).toEqual(["silhouette"]);
    expect(RESUME_WINDOW_MS).toBe(7 * DAY);
  });
  it("discard removes both copies", async () => {
    const a = make();
    a.store.save(rec());
    await a.store.flush();
    await a.store.discard("quiz");
    expect(await a.store.find("quiz")).toBeNull();
    expect(a.local!.getItem(SNAPSHOT_PREFIX + "quiz")).toBeNull();
  });
});

describe("AC-PL-011 storage unavailable", () => {
  it("reports unavailable when IndexedDB rejects and there is no snapshot, but never throws", async () => {
    const statuses: string[] = [];
    const a = make(null, (s) => statuses.push(s));
    vi.spyOn(a.db.sessions, "put").mockRejectedValue(new Error("blocked"));
    a.store.save(rec());
    await expect(a.store.flush()).resolves.toBeUndefined();
    expect(statuses).toEqual(["unavailable"]);
    expect((await a.store.find("quiz"))?.seq).toBe(1); // still resumable from memory within this tab
  });
  it("survives a throwing localStorage", async () => {
    const bad = {
      length: 0,
      key: () => null,
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("denied");
      },
      removeItem: () => {
        throw new Error("denied");
      },
    };
    const db = new MeridianDb(`test-${dbn++}`);
    const store = new SessionStore({ db, local: bad, now: () => now });
    store.save(rec());
    await store.flush();
    expect((await store.find("quiz"))?.seq).toBe(1);
  });
});
