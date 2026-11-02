import { ZodError } from "zod";
import { ERROR_STATUS, type Problem } from "@meridian/schemas";
import { PRODUCTION_URL } from "../brand";
import { log } from "../observability/log";

type ErrorCode = keyof typeof ERROR_STATUS;

const TITLES: Record<ErrorCode, string> = {
  BAD_REQUEST: "Malformed request",
  UNAUTHENTICATED: "Sign-in required",
  FORBIDDEN: "Not allowed",
  NOT_FOUND: "Not found",
  CONFLICT: "Conflict",
  GONE: "No longer available",
  PAYLOAD_TOO_LARGE: "Payload too large",
  VALIDATION_FAILED: "Invalid request",
  RATE_LIMITED: "Too many requests",
  INTERNAL: "Something went wrong",
  UNAVAILABLE: "Service unavailable",
};

export const newRequestId = (): string => `req_${crypto.randomUUID().replaceAll("-", "")}`;

/** Standard headers for every /api response: JSON is never cached (API_CONTRACTS §1). */
export const API_HEADERS = { "Cache-Control": "no-store" } as const;

export type ProblemInit = {
  detail?: string;
  errors?: { path: string; message: string }[];
  requestId?: string;
  headers?: Record<string, string>;
};

/** RFC 9457 problem+json response (API_CONTRACTS §2). */
export function problemResponse(code: ErrorCode, init: ProblemInit = {}): Response {
  const status = ERROR_STATUS[code];
  const body: Problem = {
    type: `${PRODUCTION_URL}/problems/${code.toLowerCase().replaceAll("_", "-")}`,
    title: TITLES[code],
    status,
    code,
    ...(init.detail !== undefined ? { detail: init.detail } : {}),
    ...(init.errors ? { errors: init.errors } : {}),
    request_id: init.requestId ?? newRequestId(),
  };
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...API_HEADERS,
      "Content-Type": "application/problem+json; charset=utf-8",
      ...init.headers,
    },
  });
}

export function jsonResponse(
  body: unknown,
  init: { status?: number; headers?: Record<string, string> } = {},
): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { ...API_HEADERS, "Content-Type": "application/json; charset=utf-8", ...init.headers },
  });
}

/** Thrown by handlers to produce a specific problem. */
export class ApiError extends Error {
  constructor(
    readonly code: ErrorCode,
    readonly init: Omit<ProblemInit, "requestId"> = {},
  ) {
    super(init.detail ?? code);
  }
}

export const zodErrors = (e: ZodError): { path: string; message: string }[] =>
  e.issues.map((i) => ({ path: i.path.join("."), message: i.message }));

/** The method and path of a handler's request, when its first argument is one (health has none). */
function routeOf(args: unknown[]): { method: string; path: string } {
  const req = args[0];
  if (req instanceof Request) {
    try {
      return { method: req.method, path: new URL(req.url).pathname };
    } catch {
      /* fall through */
    }
  }
  return { method: "GET", path: "unknown" };
}

/** Reports an unexpected server error to Sentry when it is configured. Loaded on demand: most requests never need it. */
function reportToSentry(e: unknown, requestId: string): void {
  if (!process.env["SENTRY_DSN"] && !process.env["NEXT_PUBLIC_SENTRY_DSN"]) return;
  void import("@sentry/nextjs")
    .then((Sentry) => Sentry.captureException(e, { tags: { request_id: requestId } }))
    .catch(() => undefined);
}

/**
 * Wraps a route handler: validation errors become 422, malformed JSON 400, `ApiError` its own code, and anything
 * else a 500 that carries only a request id (details go to the server log and Sentry, never to the client). Every
 * request writes one structured log line (method, path, status, duration, request id) and answers with
 * `X-Request-Id`, so a player's report can be matched to the log.
 */
export function handle<A extends unknown[]>(
  fn: (...args: A) => Promise<Response> | Response,
): (...args: A) => Promise<Response> {
  return async (...args: A) => {
    const requestId = newRequestId();
    const t0 = Date.now();
    const { method, path } = routeOf(args);
    let res: Response;
    let failure: unknown = null;
    try {
      res = await fn(...args);
    } catch (e) {
      if (e instanceof ApiError) res = problemResponse(e.code, { ...e.init, requestId });
      else if (e instanceof ZodError)
        res = problemResponse("VALIDATION_FAILED", { errors: zodErrors(e), requestId });
      else if (e instanceof SyntaxError)
        res = problemResponse("BAD_REQUEST", {
          detail: "Request body is not valid JSON.",
          requestId,
        });
      else {
        failure = e;
        res = problemResponse("INTERNAL", { requestId });
      }
    }
    const level = res.status >= 500 ? "error" : res.status >= 400 ? "warn" : "info";
    log(level, "api_request", {
      request_id: requestId,
      method,
      path,
      status: res.status,
      ms: Date.now() - t0,
      ...(failure
        ? {
            error_name: failure instanceof Error ? failure.name : "unknown",
            error_message: failure instanceof Error ? failure.message : String(failure),
          }
        : {}),
    });
    if (failure) reportToSentry(failure, requestId);
    try {
      res.headers.set("X-Request-Id", requestId);
    } catch {
      /* immutable headers: the body still carries the id on errors */
    }
    return res;
  };
}

/** Default body limit (API_CONTRACTS §1); the results batch uses 512 KB. */
export const MAX_BODY_BYTES = 64 * 1024;

/** Reads a JSON body, enforcing the size limit on the actual bytes (a Content-Length header can lie). */
export async function readJson(req: Request, maxBytes: number = MAX_BODY_BYTES): Promise<unknown> {
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared > maxBytes)
    throw new ApiError("PAYLOAD_TOO_LARGE", { detail: `Body must be at most ${maxBytes} bytes.` });
  const text = await req.text();
  if (new TextEncoder().encode(text).length > maxBytes)
    throw new ApiError("PAYLOAD_TOO_LARGE", { detail: `Body must be at most ${maxBytes} bytes.` });
  return JSON.parse(text);
}
