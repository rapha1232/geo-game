import { drizzleReportStore } from "../../../../lib/api/report-store";
import { createReport } from "../../../../lib/api/reports";
import { reportLimiter } from "../../../../lib/api/rate-limit";
import { handle } from "../../../../lib/api/problem";

export const dynamic = "force-dynamic";

export const POST = handle((req: Request) =>
  createReport(req, { store: drizzleReportStore(), limiter: reportLimiter, now: () => Date.now() }),
);
