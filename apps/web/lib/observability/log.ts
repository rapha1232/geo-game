/**
 * Structured server logs (ARCHITECTURE §12, observability). Every line is one JSON object on stdout/stderr, which Vercel
 * keeps for an hour on the free plan. When `AXIOM_TOKEN` and `AXIOM_DATASET` are set, lines are also shipped to Axiom
 * in batches after the response is sent, for 30 days of search. Lines carry ids, routes, codes and timings only: never a
 * request body, an answer, an IP address or anything else that identifies a player.
 */
export type LogLevel = "debug" | "info" | "warn" | "error";
export type LogValue = string | number | boolean | null | undefined;
export type LogLine = { _time: string; level: LogLevel; event: string } & Record<string, LogValue>;
export type LogSink = (lines: LogLine[]) => Promise<void>;

/** Ships a batch to Axiom's ingest API, or null when Axiom is not configured. No SDK: one fetch per batch. */
export function axiomSink(env: Record<string, string | undefined> = process.env): LogSink | null {
  const token = env["AXIOM_TOKEN"];
  const dataset = env["AXIOM_DATASET"];
  if (!token || !dataset) return null;
  const base = (env["AXIOM_URL"] ?? "https://api.axiom.co").replace(/\/$/, "");
  return async (lines) => {
    const res = await fetch(`${base}/v1/datasets/${encodeURIComponent(dataset)}/ingest`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(lines),
    });
    if (!res.ok) throw new Error(`axiom ingest ${res.status}`);
  };
}

export type LoggerDeps = {
  sink: LogSink | null;
  write: (level: LogLevel, text: string) => void;
  now: () => Date;
  /** Runs work after the response (Next's `after`); falls back to a microtask outside a request. */
  defer: (fn: () => Promise<void>) => void;
  base: Record<string, LogValue>;
};

export function createLogger(deps: LoggerDeps) {
  const buffer: LogLine[] = [];
  let scheduled = false;
  const flush = async () => {
    scheduled = false;
    const lines = buffer.splice(0);
    if (lines.length === 0 || !deps.sink) return;
    try {
      await deps.sink(lines);
    } catch (e) {
      // Logging must never break a request; say so once on stderr and drop the batch.
      deps.write(
        "warn",
        JSON.stringify({ level: "warn", event: "log_ship_failed", message: String(e) }),
      );
    }
  };
  function log(level: LogLevel, event: string, fields: Record<string, LogValue> = {}): LogLine {
    const line: LogLine = { _time: deps.now().toISOString(), level, event, ...deps.base };
    for (const [k, v] of Object.entries(fields)) if (v !== undefined) line[k] = v;
    deps.write(level, JSON.stringify(line));
    if (deps.sink) {
      buffer.push(line);
      if (!scheduled) {
        scheduled = true;
        deps.defer(flush);
      }
    }
    return line;
  }
  return { log, flush };
}

/** Next's `after()` when inside a request (the response is not held up), otherwise right away. */
async function deferAfterResponse(fn: () => Promise<void>): Promise<void> {
  try {
    const { after } = await import("next/server");
    after(fn);
  } catch {
    void fn();
  }
}

const defaultLogger = createLogger({
  sink: axiomSink(),
  write: (level, text) =>
    level === "error"
      ? console.error(text)
      : level === "warn"
        ? console.warn(text)
        : console.log(text),
  now: () => new Date(),
  defer: (fn) => void deferAfterResponse(fn),
  base: {
    service: "meridian-web",
    env: process.env["VERCEL_ENV"] ?? process.env.NODE_ENV,
    version: process.env["VERCEL_GIT_COMMIT_SHA"]?.slice(0, 7) ?? "dev",
  },
});

export const log = defaultLogger.log;
