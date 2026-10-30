import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { serializeLock, verifyAgainstLock, type LockEntry, type LockFile } from "./lock.ts";
import { SOURCES, type SourceDef } from "./sources.ts";
import { sha256, USER_AGENT } from "./util.ts";
import type { Fetcher } from "./wikidata.ts";

export type FetchOptions = {
  rawDir: string;
  lock: LockFile;
  updateLock: boolean;
  fetcher: Fetcher;
  log?: (m: string) => void;
};
export type FetchResult = { lock: LockFile; downloaded: string[]; cached: string[] };

async function readIfExists(path: string): Promise<Uint8Array | null> {
  try {
    return new Uint8Array(await readFile(path));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw e;
  }
}

/**
 * Makes sure every source is on disk and matches the lock. Cached files are re-hashed, never trusted.
 * A source that differs from its pin fails, unless `updateLock` is set (then the pin is rewritten).
 */
export async function fetchSources(
  opts: FetchOptions,
  sources: readonly SourceDef[] = SOURCES,
): Promise<FetchResult> {
  const log = opts.log ?? (() => undefined);
  const entries = new Map(opts.lock.entries.map((e) => [e.id, e] as const));
  const downloaded: string[] = [];
  const cached: string[] = [];
  for (const s of sources) {
    const path = join(opts.rawDir, s.file);
    let bytes = await readIfExists(path);
    const fresh = bytes === null;
    if (fresh) {
      log(`fetch ${s.id}`);
      const res = await opts.fetcher(s.url, { headers: { "User-Agent": USER_AGENT } });
      if (!res.ok) throw new Error(`${s.id}: HTTP ${res.status} for ${s.url}`);
      bytes = new Uint8Array(await res.arrayBuffer());
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, bytes);
      downloaded.push(s.id);
    } else cached.push(s.id);
    const check = verifyAgainstLock({ entries: [...entries.values()] }, s.id, bytes as Uint8Array);
    if (!check.ok) {
      if (!opts.updateLock)
        throw new Error(`${s.id}: ${check.reason}. Run with --update-lock to accept it.`);
      const entry: LockEntry = {
        id: s.id,
        source: s.source,
        url: s.url,
        version: s.version,
        sha256: sha256(bytes as Uint8Array),
        bytes: (bytes as Uint8Array).length,
      };
      entries.set(s.id, entry);
      log(`pinned ${s.id} ${entry.sha256.slice(0, 12)}…`);
    }
  }
  return { lock: { entries: [...entries.values()] }, downloaded, cached };
}

export const lockText = (lock: LockFile): string => serializeLock(lock);
