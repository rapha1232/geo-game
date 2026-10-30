import { RATE_LIMITS } from "./rate-limits";

/**
 * A best-effort limiter for one server instance (ARCHITECTURE §12). The Vercel WAF rules in `rate-limits.ts` are the
 * real enforcement across instances; this keeps a single warm instance honest and makes AC-PL-018 testable.
 */
export class RateLimiter {
  private hits = new Map<string, number[]>();
  constructor(private readonly rules: readonly { limit: number; windowSeconds: number }[]) {}

  /** Records a request and returns 0 when it is allowed, otherwise the seconds to wait. */
  take(key: string, nowMs: number): number {
    const longest = Math.max(...this.rules.map((r) => r.windowSeconds)) * 1000;
    const times = (this.hits.get(key) ?? []).filter((t) => nowMs - t < longest);
    let wait = 0;
    for (const r of this.rules) {
      const inWindow = times.filter((t) => nowMs - t < r.windowSeconds * 1000);
      if (inWindow.length >= r.limit) {
        const oldest = inWindow[0] as number;
        wait = Math.max(wait, Math.ceil((oldest + r.windowSeconds * 1000 - nowMs) / 1000));
      }
    }
    if (wait > 0) {
      this.hits.set(key, times);
      return wait;
    }
    times.push(nowMs);
    this.hits.set(key, times);
    return 0;
  }
}

export const reportLimiter = new RateLimiter(
  RATE_LIMITS.filter((r) => r.path === "/api/v1/reports"),
);
