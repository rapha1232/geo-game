import { parse, stringify } from "yaml";
import { sha256 } from "./util.ts";

export type LockEntry = {
  id: string;
  /** Registry id from data/sources.registry.yaml. */
  source: string;
  url: string;
  /** Upstream version or tag that the URL is pinned to. */
  version: string;
  sha256: string;
  bytes: number;
};
export type LockFile = { entries: LockEntry[] };

export function parseLock(text: string): LockFile {
  const raw = parse(text, { schema: "core" }) as { entries?: LockEntry[] } | null;
  return { entries: raw?.entries ?? [] };
}

/** Entries sorted by id so the file is stable under re-generation. */
export function serializeLock(lock: LockFile): string {
  const entries = [...lock.entries].sort((a, b) => a.id.localeCompare(b.id));
  return `# Pinned source versions and checksums (DATA_AND_CONTENT §3). Regenerate with: pnpm content:fetch --update-lock\n${stringify({ entries }, { lineWidth: 0 })}`;
}

export type Verification = { id: string; ok: boolean; reason?: string };

/** Compares downloaded bytes with the pinned entry. A missing entry or a different hash fails. */
export function verifyAgainstLock(lock: LockFile, id: string, bytes: Uint8Array): Verification {
  const entry = lock.entries.find((e) => e.id === id);
  if (!entry) return { id, ok: false, reason: "not pinned in sources.lock.yaml" };
  const actual = sha256(bytes);
  return actual === entry.sha256
    ? { id, ok: true }
    : {
        id,
        ok: false,
        reason: `sha256 mismatch: pinned ${entry.sha256.slice(0, 12)}…, got ${actual.slice(0, 12)}…`,
      };
}
