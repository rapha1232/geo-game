import { REPORT_CATEGORIES } from "@meridian/schemas";

export type ReportCategory = (typeof REPORT_CATEGORIES)[number];
export const CATEGORIES = REPORT_CATEGORIES;
export const MIN_LENGTH = 10;
export const MAX_LENGTH = 1000;

export type ReportInput = {
  category: ReportCategory;
  message: string;
  email: string;
  targetRef?: string | undefined;
  context: Record<string, unknown>;
};

export type ReportResult =
  | { ok: true }
  | { ok: false; reason: "rate-limited"; retryAfter: number }
  | { ok: false; reason: "invalid" | "unavailable" | "network" };

/** Field problems, shown after the field is left (blur-first), never while typing. */
export function validate(input: Pick<ReportInput, "message" | "email">): {
  message?: "short" | "long";
  email?: "invalid";
} {
  const n = input.message.trim().length;
  return {
    ...(n < MIN_LENGTH
      ? { message: "short" as const }
      : n > MAX_LENGTH
        ? { message: "long" as const }
        : {}),
    ...(input.email.trim() !== "" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email.trim())
      ? { email: "invalid" as const }
      : {}),
  };
}

/** Context is capped at 4 KB by the API: long player input is trimmed first. */
export function trimContext(context: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(context))
    out[k] = typeof v === "string" ? v.slice(0, 200) : v;
  return out;
}

export async function sendReport(
  input: ReportInput,
  fetcher: typeof fetch = fetch,
): Promise<ReportResult> {
  try {
    const res = await fetcher("/api/v1/reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        category: input.category,
        message: input.message.trim(),
        ...(input.targetRef ? { target_ref: input.targetRef } : {}),
        context: trimContext(input.context),
        ...(input.email.trim() ? { reporter_email: input.email.trim() } : {}),
      }),
    });
    if (res.status === 202) return { ok: true };
    if (res.status === 429)
      return {
        ok: false,
        reason: "rate-limited",
        retryAfter: Number(res.headers.get("Retry-After")) || 60,
      };
    if (res.status === 422 || res.status === 400) return { ok: false, reason: "invalid" };
    return { ok: false, reason: "unavailable" };
  } catch {
    return { ok: false, reason: "network" };
  }
}
