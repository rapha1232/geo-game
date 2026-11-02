/**
 * Options shared by the Sentry clients (server, edge, browser). Sentry stays off unless a DSN is configured, so local
 * builds and previews without one send nothing. No personal data: no IP addresses, cookies or request bodies, and the
 * player's answers never appear in an error.
 */
export const SENTRY_TUNNEL = "/monitoring";

export function sentryDsn(
  env: Record<string, string | undefined> = process.env,
): string | undefined {
  return env["SENTRY_DSN"] || env["NEXT_PUBLIC_SENTRY_DSN"] || undefined;
}

export function sentryBaseOptions(dsn: string | undefined) {
  return {
    dsn,
    enabled: Boolean(dsn),
    environment:
      process.env["NEXT_PUBLIC_VERCEL_ENV"] ?? process.env["VERCEL_ENV"] ?? process.env.NODE_ENV,
    release:
      process.env["NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA"] ?? process.env["VERCEL_GIT_COMMIT_SHA"],
    sendDefaultPii: false,
    // Performance comes from Speed Insights; a small trace sample keeps slow server routes visible within the free quota.
    tracesSampleRate: 0.05,
  };
}

/** Browser noise that is not ours to fix: extensions, benign resize loops, aborted fetches when leaving a page. */
export const IGNORE_ERRORS = [
  "ResizeObserver loop limit exceeded",
  "ResizeObserver loop completed with undelivered notifications",
  "AbortError",
  "Load failed",
  "Failed to fetch",
  "NetworkError when attempting to fetch resource",
];
export const DENY_URLS = [
  /^chrome-extension:\/\//,
  /^moz-extension:\/\//,
  /^safari-(web-)?extension:\/\//,
];
