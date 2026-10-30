import { ZodError } from "zod";
import { ERROR_STATUS, type Problem } from "@meridian/schemas";
import { PRODUCTION_URL } from "../brand";

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

/**
 * Wraps a route handler: validation errors become 422, malformed JSON 400, `ApiError` its own code, and anything
 * else a 500 that carries only a request id (details go to the server log, never to the client).
 */
export function handle<A extends unknown[]>(
  fn: (...args: A) => Promise<Response> | Response,
): (...args: A) => Promise<Response> {
  return async (...args: A) => {
    const requestId = newRequestId();
    try {
      return await fn(...args);
    } catch (e) {
      if (e instanceof ApiError) return problemResponse(e.code, { ...e.init, requestId });
      if (e instanceof ZodError)
        return problemResponse("VALIDATION_FAILED", { errors: zodErrors(e), requestId });
      if (e instanceof SyntaxError)
        return problemResponse("BAD_REQUEST", {
          detail: "Request body is not valid JSON.",
          requestId,
        });
      console.error(
        JSON.stringify({
          level: "error",
          requestId,
          name: e instanceof Error ? e.name : "unknown",
          message: e instanceof Error ? e.message : String(e),
        }),
      );
      return problemResponse("INTERNAL", { requestId });
    }
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
