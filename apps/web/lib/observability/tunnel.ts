import { RateLimiter } from "../api/rate-limit";

/** At most this many bytes per envelope: errors are small, and we never send attachments or replays. */
export const MAX_ENVELOPE_BYTES = 256 * 1024;

export const tunnelLimiter = new RateLimiter([{ limit: 60, windowSeconds: 60 }]);

/**
 * The Sentry tunnel (ARCHITECTURE §12): the browser posts error envelopes to our own origin, so no page makes a
 * third-party request (AC-PL-003), and this forwards them to Sentry. Only envelopes addressed to our own DSN are
 * forwarded, so the route cannot be used to relay anything else.
 */
export async function forwardEnvelope(
  req: Request,
  deps: {
    dsn: string | undefined;
    fetch: typeof fetch;
    limiter: RateLimiter;
    now: () => number;
  },
): Promise<Response> {
  if (!deps.dsn) return new Response(null, { status: 204 });
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (deps.limiter.take(ip, deps.now()) > 0) return new Response(null, { status: 429 });
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared > MAX_ENVELOPE_BYTES) return new Response(null, { status: 413 });
  const body = new Uint8Array(await req.arrayBuffer());
  if (body.byteLength > MAX_ENVELOPE_BYTES) return new Response(null, { status: 413 });

  const newline = body.indexOf(10);
  let header: { dsn?: unknown };
  try {
    header = JSON.parse(new TextDecoder().decode(newline < 0 ? body : body.subarray(0, newline)));
  } catch {
    return new Response(null, { status: 400 });
  }
  let ours: URL;
  let theirs: URL;
  try {
    ours = new URL(deps.dsn);
    theirs = new URL(String(header.dsn));
  } catch {
    return new Response(null, { status: 400 });
  }
  if (theirs.host !== ours.host || theirs.pathname !== ours.pathname)
    return new Response(null, { status: 403 });

  const projectId = ours.pathname.replace(/^\//, "");
  const upstream = await deps.fetch(`https://${ours.host}/api/${projectId}/envelope/`, {
    method: "POST",
    body,
    headers: { "Content-Type": "application/x-sentry-envelope" },
  });
  return new Response(null, { status: upstream.ok ? 200 : upstream.status });
}
