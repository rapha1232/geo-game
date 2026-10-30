import { createReportRequest, createReportResponse } from "@meridian/schemas";
import { ApiError, jsonResponse, readJson } from "./problem";
import type { RateLimiter } from "./rate-limit";

export type ReportRow = {
  category: string;
  message: string;
  targetRef: string | null;
  context: Record<string, unknown>;
  contentVersion: string;
  reporterEmail: string | null;
};

export type DedupeRow = {
  id: string;
  createdAt: number;
  targetRef: string;
  category: string;
  message: string;
};

/** Storage seam: the Drizzle implementation is in `report-store.ts`, tests use an in-memory one. */
export interface ReportStore {
  insert(row: ReportRow): Promise<{ id: string; status: string }>;
  /** Reports from the last 30 days that are not yet duplicates and have a target. */
  listForDedupe(sinceMs: number): Promise<DedupeRow[]>;
  markDuplicate(id: string, of: string): Promise<void>;
}

export type ReportDeps = {
  store: ReportStore | null;
  limiter: RateLimiter;
  now: () => number;
};

export const clientIp = (req: Request): string =>
  req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
  req.headers.get("x-real-ip") ||
  "unknown";

/** `POST /api/v1/reports` (API_CONTRACTS §4.3): validates, rate-limits per IP, stores, answers 202. */
export async function createReport(req: Request, deps: ReportDeps): Promise<Response> {
  const wait = deps.limiter.take(clientIp(req), deps.now());
  if (wait > 0)
    throw new ApiError("RATE_LIMITED", {
      detail: "Too many reports. Try again shortly.",
      headers: { "Retry-After": String(wait) },
    });
  const body = createReportRequest.parse(await readJson(req));
  if (!deps.store)
    throw new ApiError("UNAVAILABLE", { detail: "Reports are unavailable right now." });
  const version = body.context["content_version"];
  const row = await deps.store.insert({
    category: body.category,
    message: body.message,
    targetRef: body.target_ref ?? null,
    context: body.context,
    contentVersion: typeof version === "string" && version ? version.slice(0, 32) : "unknown",
    reporterEmail: body.reporter_email ?? null,
  });
  return jsonResponse(createReportResponse.parse({ id: row.id, status: row.status }), {
    status: 202,
  });
}

const tokens = (s: string): Set<string> =>
  new Set(
    s
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2),
  );

const jaccard = (a: Set<string>, b: Set<string>): number => {
  if (a.size === 0 || b.size === 0) return 0;
  let both = 0;
  for (const x of a) if (b.has(x)) both++;
  return both / (a.size + b.size - both);
};

/**
 * The dedupe job: a report about the same target and category as an earlier one, with a message that shares at least
 * half its words, is marked a duplicate of the earliest. Pure, so the job and the tests share it.
 */
export function findDuplicates(
  rows: readonly DedupeRow[],
  threshold = 0.5,
): { id: string; of: string }[] {
  const out: { id: string; of: string }[] = [];
  const groups = new Map<string, DedupeRow[]>();
  for (const r of [...rows].sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id)))
    (
      groups.get(`${r.targetRef}|${r.category}`) ??
      groups.set(`${r.targetRef}|${r.category}`, []).get(`${r.targetRef}|${r.category}`)!
    ).push(r);
  for (const group of groups.values()) {
    const originals: { row: DedupeRow; words: Set<string> }[] = [];
    for (const r of group) {
      const words = tokens(r.message);
      const match = originals.find((o) => jaccard(o.words, words) >= threshold);
      if (match) out.push({ id: r.id, of: match.row.id });
      else originals.push({ row: r, words });
    }
  }
  return out;
}

/** Runs the dedupe job over the store; returns how many reports were marked. */
export async function runDedupe(store: ReportStore, nowMs: number): Promise<number> {
  const rows = await store.listForDedupe(nowMs - 30 * 86_400_000);
  const dups = findDuplicates(rows);
  for (const d of dups) await store.markDuplicate(d.id, d.of);
  return dups.length;
}
