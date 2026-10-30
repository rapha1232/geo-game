import { z } from "zod";
import { contentVersion, isoDateTime } from "./ids";
import { gameId } from "./result";

/** `GET /api/v1/health` (API_CONTRACTS §4.1). */
export const healthResponse = z.object({
  status: z.enum(["ok", "degraded"]),
  db: z.enum(["ok", "down"]),
  /** Null until the first content release exists. */
  content_version: contentVersion.nullable(),
  app_version: z.string().min(1),
});

/** Problem details, RFC 9457 (API_CONTRACTS §2). */
export const ERROR_CODES = [
  "BAD_REQUEST",
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "NOT_FOUND",
  "CONFLICT",
  "GONE",
  "PAYLOAD_TOO_LARGE",
  "VALIDATION_FAILED",
  "RATE_LIMITED",
  "INTERNAL",
  "UNAVAILABLE",
] as const;

export const problem = z.object({
  type: z.string().url(),
  title: z.string().min(1),
  status: z.number().int().min(400).max(599),
  code: z.enum(ERROR_CODES),
  detail: z.string().optional(),
  errors: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
  request_id: z.string().min(1),
});
export type Problem = z.infer<typeof problem>;

/** HTTP status for each error code. */
export const ERROR_STATUS: Record<(typeof ERROR_CODES)[number], number> = {
  BAD_REQUEST: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  GONE: 410,
  PAYLOAD_TOO_LARGE: 413,
  VALIDATION_FAILED: 422,
  RATE_LIMITED: 429,
  INTERNAL: 500,
  UNAVAILABLE: 503,
};

/** `POST /api/v1/challenges` (API_CONTRACTS §4.2). The payload is a long code of at most 2 KB. */
export const createChallengeRequest = z.object({
  game_id: gameId,
  payload: z.string().min(1).max(2048),
  content_version: contentVersion,
});
export const createChallengeResponse = z.object({
  code: z.string().regex(/^[A-Z]{2,3}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/),
  url: z.string().url(),
});
export const resolveChallengeResponse = createChallengeRequest;

/** `POST /api/v1/reports` (API_CONTRACTS §4.3, DATA_MODEL §3.3). */
export const REPORT_CATEGORIES = [
  "answer_rejected",
  "answer_accepted_wrongly",
  "wrong_fact",
  "map_issue",
  "spelling",
  "sensitive",
  "other",
] as const;
export const REPORT_STATUSES = [
  "new",
  "triaged",
  "accepted",
  "declined",
  "fixed",
  "duplicate",
] as const;
export const REPORT_SEVERITIES = ["S1", "S2", "S3"] as const;

export const createReportRequest = z.object({
  category: z.enum(REPORT_CATEGORIES),
  message: z.string().min(10).max(1000),
  target_ref: z.string().min(1).optional(),
  context: z
    .record(z.string(), z.unknown())
    .refine((c) => JSON.stringify(c).length <= 4096, "context must be at most 4 KB"),
  reporter_email: z.string().email().optional(),
});
export type CreateReportRequest = z.infer<typeof createReportRequest>;
export const createReportResponse = z.object({
  id: z.string().uuid(),
  status: z.enum(REPORT_STATUSES),
});

/** `POST /api/v1/results:batch` response (API_CONTRACTS §4.5). */
export const resultsBatchResponse = z.object({
  accepted: z.array(z.string()),
  duplicates: z.array(z.string()),
  rejected: z.array(z.object({ id: z.string(), code: z.string(), detail: z.string() })),
  personal_bests_updated: z.array(z.string()),
});
export const resultsBatchRequest = z.object({ results: z.array(z.unknown()).min(1).max(50) });

export { isoDateTime };
