import { manifest as manifestSchema, type Manifest, type PackEntry } from "@meridian/schemas";
import type { MeridianDb } from "../storage/db";

/** Where the last good manifest is kept in the `packs` table (never a real pack URL). */
const MANIFEST_KEY = "manifest:last-good";

export class ContentError extends Error {
  constructor(
    readonly kind: "network" | "integrity" | "invalid",
    message: string,
  ) {
    super(message);
  }
}

type Options = {
  /** Origin of the content host without a trailing slash: "" for same-origin (dev) or the Blob host. */
  host: string;
  db: MeridianDb | null;
  fetcher?: typeof fetch;
  onProgress?: (pack: string, loaded: number, total: number) => void;
};

const hex = (buf: ArrayBuffer) =>
  [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

/** Loads the manifest and packs, verifying sha256 and caching packs in IndexedDB (ARCHITECTURE §6.3, DATA_MODEL §2.10). */
export class ContentLoader {
  private manifestPromise: Promise<Manifest> | null = null;
  private inflight = new Map<string, Promise<unknown>>();
  private readonly fetcher: typeof fetch;

  constructor(private readonly o: Options) {
    this.fetcher = o.fetcher ?? ((...a) => fetch(...a));
  }

  /**
   * The manifest, fetched once per load. A copy of the last good one is kept in IndexedDB, so with the network down
   * the packs already cached still load (AC-PL-014). With nothing cached, callers show the pack-load error state.
   */
  manifest(): Promise<Manifest> {
    this.manifestPromise ??= this.get(`${this.o.host}/content/manifest.json`)
      .then((r) => r.json())
      .then(async (j) => {
        const parsed = manifestSchema.safeParse(j);
        if (!parsed.success) throw new ContentError("invalid", "manifest.json failed validation");
        await this.o.db?.packs
          .put({ url: MANIFEST_KEY, sha256: "", json: parsed.data })
          .catch(() => undefined);
        return parsed.data;
      })
      .catch(async (e: unknown) => {
        this.manifestPromise = null;
        if (e instanceof ContentError && e.kind === "network") {
          const kept = await this.o.db?.packs.get(MANIFEST_KEY).catch(() => undefined);
          const parsed = manifestSchema.safeParse(kept?.json);
          if (parsed.success) return parsed.data;
        }
        throw e;
      });
    return this.manifestPromise;
  }

  async entry(pack: string, version?: string): Promise<PackEntry> {
    const m = await this.manifest();
    const v = m.versions[version ?? m.current];
    const entry = v?.packs[pack];
    if (!entry)
      throw new ContentError("invalid", `pack ${pack} is not in version ${version ?? m.current}`);
    return entry;
  }

  /** A pack's JSON. Cached copies are used only when their hash matches the manifest entry. */
  pack<T = unknown>(pack: string, version?: string): Promise<T> {
    const key = `${version ?? "current"}/${pack}`;
    const hit = this.inflight.get(key);
    if (hit) return hit as Promise<T>;
    const p = this.loadPack<T>(pack, version).catch((e: unknown) => {
      this.inflight.delete(key);
      throw e;
    });
    this.inflight.set(key, p);
    return p;
  }

  private async loadPack<T>(pack: string, version?: string): Promise<T> {
    const entry = await this.entry(pack, version);
    const cached = await this.o.db?.packs.get(entry.url).catch(() => undefined);
    if (cached && cached.sha256 === entry.sha256) return cached.json as T;
    const res = await this.get(`${this.o.host}/${entry.url}`);
    const bytes = await res.arrayBuffer();
    this.o.onProgress?.(pack, bytes.byteLength, entry.bytes);
    const digest = hex(await crypto.subtle.digest("SHA-256", bytes));
    if (digest !== entry.sha256)
      throw new ContentError(
        "integrity",
        `${pack}: hash mismatch, expected ${entry.sha256.slice(0, 12)}`,
      );
    const json = JSON.parse(new TextDecoder().decode(bytes)) as T;
    await this.o.db?.packs
      .put({ url: entry.url, sha256: entry.sha256, json })
      .catch(() => undefined);
    return json;
  }

  private async get(url: string): Promise<Response> {
    let res: Response;
    try {
      res = await this.fetcher(url);
    } catch {
      throw new ContentError("network", `could not reach ${url}`);
    }
    if (!res.ok) throw new ContentError("network", `${url} returned ${res.status}`);
    return res;
  }
}
