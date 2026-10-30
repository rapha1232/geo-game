import { ApiError, handle, jsonResponse } from "../../../../lib/api/problem";
import { drizzleReportStore } from "../../../../lib/api/report-store";
import { runDedupe } from "../../../../lib/api/reports";

export const dynamic = "force-dynamic";

/** The daily dedupe job (T1.15). Vercel Cron calls it with `Authorization: Bearer $CRON_SECRET`. */
export const GET = handle(async (req: Request) => {
  const secret = process.env["CRON_SECRET"];
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`)
    throw new ApiError("UNAUTHENTICATED", { detail: "Not allowed." });
  const store = drizzleReportStore();
  if (!store) throw new ApiError("UNAVAILABLE", { detail: "No database is configured." });
  return jsonResponse({ marked: await runDedupe(store, Date.now()) });
});
