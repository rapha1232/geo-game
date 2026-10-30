import { healthResponse } from "@meridian/schemas";
import { jsonResponse } from "./problem";
import { getDb } from "../db/client";

export type HealthDeps = {
  /** Resolves when the database answers; rejects or never resolves when it is down. */
  pingDb: () => Promise<void>;
  contentVersion: string | null;
  appVersion: string;
  timeoutMs?: number;
};

/** Health check (API_CONTRACTS §4.1): 200 when the database answers, 503 with `db: "down"` otherwise. */
export async function checkHealth(deps: HealthDeps): Promise<Response> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const db = await Promise.race([
    deps.pingDb().then(
      () => "ok" as const,
      () => "down" as const,
    ),
    new Promise<"down">((resolve) => {
      timer = setTimeout(() => resolve("down"), deps.timeoutMs ?? 2000);
    }),
  ]);
  clearTimeout(timer);
  const body = healthResponse.parse({
    status: db === "ok" ? "ok" : "degraded",
    db,
    content_version: deps.contentVersion,
    app_version: deps.appVersion,
  });
  return jsonResponse(body, { status: db === "ok" ? 200 : 503 });
}

export async function pingDatabase(): Promise<void> {
  const db = getDb();
  if (!db) throw new Error("no database configured");
  await db.execute("select 1");
}

/** Latest released content version, or null until the first release exists (T1.21). */
export const currentContentVersion = (): string | null => process.env.CONTENT_VERSION ?? null;

export const appVersion = (): string => process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "dev";
