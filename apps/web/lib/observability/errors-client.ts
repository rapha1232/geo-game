import { DENY_URLS, IGNORE_ERRORS, SENTRY_TUNNEL, sentryBaseOptions } from "./sentry-options";

/**
 * Browser error reporting. Sentry's SDK loads after the page is interactive, so it stays out of the shell bundle
 * (ARCHITECTURE §13); errors thrown before then are buffered and sent once it is ready. Events leave through our own
 * origin (`/monitoring`), never straight to Sentry (AC-PL-003). Nothing happens without `NEXT_PUBLIC_SENTRY_DSN`.
 */
type Sentry = typeof import("@sentry/nextjs");

const MAX_BUFFER = 20;
const early: unknown[] = [];
let sentry: Sentry | null = null;
let starting: Promise<Sentry | null> | null = null;
let listening = false;

const dsn = (): string | undefined => process.env["NEXT_PUBLIC_SENTRY_DSN"] || undefined;

const onError = (e: ErrorEvent) => {
  if (early.length < MAX_BUFFER) early.push(e.error ?? e.message);
};
const onRejection = (e: PromiseRejectionEvent) => {
  if (early.length < MAX_BUFFER) early.push(e.reason);
};

/** Catches errors from the first moment the shell runs, before the SDK has loaded. */
export function installEarlyErrorBuffer(): void {
  if (listening || typeof window === "undefined" || !dsn()) return;
  listening = true;
  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onRejection);
}

export function startErrorReporting(): Promise<Sentry | null> {
  if (!dsn() || typeof window === "undefined") return Promise.resolve(null);
  starting ??= import("@sentry/nextjs")
    .then((S) => {
      S.init({
        ...sentryBaseOptions(dsn()),
        tunnel: SENTRY_TUNNEL,
        ignoreErrors: IGNORE_ERRORS,
        denyUrls: DENY_URLS,
        // Errors only in the browser: page speed is measured by Speed Insights.
        tracesSampleRate: 0,
      });
      sentry = S;
      if (listening) {
        window.removeEventListener("error", onError);
        window.removeEventListener("unhandledrejection", onRejection);
        listening = false;
      }
      for (const e of early.splice(0)) S.captureException(e);
      return S;
    })
    .catch(() => null);
  return starting;
}

/** Reports an error caught by an error boundary (the SDK does not see those on its own). */
export function reportError(error: unknown, context: Record<string, string> = {}): void {
  if (!dsn()) return;
  if (sentry) {
    sentry.captureException(error, { tags: context });
    return;
  }
  if (early.length < MAX_BUFFER) early.push(error);
  void startErrorReporting();
}
