import type { TelemetryEvent } from "@meridian/schemas";

export const ENDPOINT = "/api/v1/telemetry/answers";
export const FLUSH_MS = 30_000;
export const MAX_EVENTS = 100;

const randomHex = (): string => {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
};

type Sender = (url: string, body: string) => boolean | Promise<unknown>;

/**
 * Batches anonymous answer events and sends them every 30 s and when the page is hidden (API_CONTRACTS §4.6). `enabled`
 * is asked on every enqueue and flush, so turning telemetry off in Settings stops all calls straight away and drops
 * whatever was waiting (AC-PL-033). The session hash is random, lives in memory only and identifies nobody.
 */
export class TelemetryClient {
  private queue: { version: string; event: TelemetryEvent }[] = [];
  private readonly session = randomHex();

  constructor(
    private readonly enabled: () => Promise<boolean> | boolean,
    private readonly send: Sender,
  ) {}

  async enqueue(contentVersion: string, events: readonly TelemetryEvent[]): Promise<void> {
    if (events.length === 0 || !(await this.enabled())) return;
    for (const event of events) this.queue.push({ version: contentVersion, event });
  }

  get pending(): number {
    return this.queue.length;
  }

  async flush(): Promise<void> {
    if (this.queue.length === 0) return;
    if (!(await this.enabled())) {
      this.queue = [];
      return;
    }
    const batch = this.queue.splice(0, this.queue.length);
    const byVersion = new Map<string, TelemetryEvent[]>();
    for (const { version, event } of batch)
      (byVersion.get(version) ?? byVersion.set(version, []).get(version)!).push(event);
    for (const [version, events] of byVersion)
      for (let i = 0; i < events.length; i += MAX_EVENTS)
        try {
          await this.send(
            ENDPOINT,
            JSON.stringify({
              session_hash: this.session,
              content_version: version,
              events: events.slice(i, i + MAX_EVENTS),
            }),
          );
        } catch {
          /* statistics are best effort: a failed send is dropped, never retried loudly */
        }
  }
}

/** `sendBeacon` when the page is going away, `fetch` with keepalive otherwise. No cookies, no referrer. */
export const browserSender: Sender = (url, body) => {
  if (typeof navigator !== "undefined" && "sendBeacon" in navigator)
    if (navigator.sendBeacon(url, new Blob([body], { type: "application/json" }))) return true;
  return fetch(url, {
    method: "POST",
    body,
    headers: { "Content-Type": "application/json" },
    keepalive: true,
    credentials: "omit",
    referrerPolicy: "no-referrer",
  });
};
