import type { MeridianDb, SessionRecord } from "./db";

/** A session older than this is not offered for resume (UX_AND_DESIGN §8). */
export const RESUME_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
/** Compact synchronous snapshot limit (ARCHITECTURE §9.1). */
export const SNAPSHOT_LIMIT_BYTES = 50 * 1024;
export const SNAPSHOT_PREFIX = "meridian:session:";

export type StoreStatus = "ok" | "unavailable";

type Options = {
  db: MeridianDb;
  /** localStorage, or null when the browser blocks it. */
  local: Pick<Storage, "getItem" | "setItem" | "removeItem" | "key" | "length"> | null;
  now: () => number;
  debounceMs?: number;
  onStatus?: ((s: StoreStatus) => void) | undefined;
};

const safe = <T>(fn: () => T, fallback: T): T => {
  try {
    return fn();
  } catch {
    return fallback;
  }
};

/**
 * Session persistence: debounced IndexedDB writes plus a synchronous localStorage snapshot that survives
 * `pagehide`. When both fail the game keeps running in memory and `onStatus("unavailable")` fires
 * (AC-PL-011).
 */
export class SessionStore {
  private pending = new Map<string, SessionRecord>();
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  /** Latest record per game for this tab, kept even when every storage write fails. */
  private memory = new Map<string, SessionRecord>();
  private snapshotOk = new Map<string, boolean>();
  private status: StoreStatus = "ok";
  private readonly debounceMs: number;

  constructor(private readonly o: Options) {
    this.debounceMs = o.debounceMs ?? 250;
  }

  private setStatus(s: StoreStatus) {
    if (s !== this.status) {
      this.status = s;
      this.o.onStatus?.(s);
    }
  }

  /** Records the latest state. Cheap to call on every event. */
  save(record: SessionRecord): void {
    this.pending.set(record.game_id, record);
    this.memory.set(record.game_id, record);
    this.snapshotOk.set(record.game_id, this.writeSnapshot(record));
    const prev = this.timers.get(record.game_id);
    if (prev) clearTimeout(prev);
    this.timers.set(
      record.game_id,
      setTimeout(() => void this.flush(record.game_id), this.debounceMs),
    );
  }

  private writeSnapshot(record: SessionRecord): boolean {
    const local = this.o.local;
    if (!local) return false;
    const text = JSON.stringify(record);
    if (text.length > SNAPSHOT_LIMIT_BYTES) return false;
    return safe(() => (local.setItem(SNAPSHOT_PREFIX + record.game_id, text), true), false);
  }

  /** Writes pending state to IndexedDB now (call on `visibilitychange: hidden`). */
  async flush(gameId?: string): Promise<void> {
    const ids = gameId ? [gameId] : [...this.pending.keys()];
    for (const id of ids) {
      const record = this.pending.get(id);
      const t = this.timers.get(id);
      if (t) clearTimeout(t);
      this.timers.delete(id);
      if (!record) continue;
      this.pending.delete(id);
      try {
        await this.o.db.sessions.put(record);
        this.setStatus("ok");
      } catch {
        // IndexedDB blocked or over quota: the snapshot is the only copy, and may not exist either.
        this.setStatus(this.snapshotOk.get(id) ? "ok" : "unavailable");
      }
    }
  }

  private readSnapshot(gameId: string): SessionRecord | null {
    const local = this.o.local;
    if (!local) return null;
    return safe(() => {
      const text = local.getItem(SNAPSHOT_PREFIX + gameId);
      return text ? (JSON.parse(text) as SessionRecord) : null;
    }, null);
  }

  private fresh(r: SessionRecord | null | undefined): SessionRecord | null {
    return r && this.o.now() - r.updated_at <= RESUME_WINDOW_MS ? r : null;
  }

  /** The resumable session for a game: the newer (by seq) of the IndexedDB and snapshot copies, if within 7 days. */
  async find(gameId: string): Promise<SessionRecord | null> {
    const mem = this.memory.get(gameId) ?? null;
    const idb = await this.o.db.sessions.get(gameId).catch(() => undefined);
    const best = [mem, idb ?? null, this.readSnapshot(gameId)]
      .filter((r): r is SessionRecord => r !== null)
      .sort((a, b) => b.seq - a.seq)[0];
    return this.fresh(best);
  }

  /** All resumable sessions, newest first, for the Home "Continue" card. */
  async listResumable(): Promise<SessionRecord[]> {
    const ids = new Set<string>(this.memory.keys());
    for (const r of await this.o.db.sessions.toArray().catch(() => [])) ids.add(r.game_id);
    const local = this.o.local;
    if (local)
      safe(() => {
        for (let i = 0; i < local.length; i++) {
          const k = local.key(i);
          if (k?.startsWith(SNAPSHOT_PREFIX)) ids.add(k.slice(SNAPSHOT_PREFIX.length));
        }
      }, undefined);
    const found = await Promise.all([...ids].map((id) => this.find(id)));
    return found
      .filter((r): r is SessionRecord => r !== null)
      .sort((a, b) => b.updated_at - a.updated_at);
  }

  async discard(gameId: string): Promise<void> {
    const t = this.timers.get(gameId);
    if (t) clearTimeout(t);
    this.timers.delete(gameId);
    this.pending.delete(gameId);
    this.memory.delete(gameId);
    safe(() => this.o.local?.removeItem(SNAPSHOT_PREFIX + gameId), undefined);
    await this.o.db.sessions.delete(gameId).catch(() => undefined);
  }
}
