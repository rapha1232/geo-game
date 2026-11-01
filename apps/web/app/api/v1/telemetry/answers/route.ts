import { drizzleTelemetryStore } from "../../../../../lib/api/telemetry-store";
import { ingestAnswers } from "../../../../../lib/api/telemetry";
import { telemetryLimiter } from "../../../../../lib/api/rate-limit";
import { handle } from "../../../../../lib/api/problem";

export const dynamic = "force-dynamic";

export const POST = handle((req: Request) =>
  ingestAnswers(req, {
    store: drizzleTelemetryStore(),
    limiter: telemetryLimiter,
    now: () => Date.now(),
  }),
);
