import { forwardEnvelope, tunnelLimiter } from "../../lib/observability/tunnel";

export const dynamic = "force-dynamic";

export function POST(req: Request) {
  return forwardEnvelope(req, {
    dsn: process.env["NEXT_PUBLIC_SENTRY_DSN"] || process.env["SENTRY_DSN"],
    fetch,
    limiter: tunnelLimiter,
    now: () => Date.now(),
  });
}
