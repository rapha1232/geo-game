import * as Sentry from "@sentry/nextjs";
import { log } from "./lib/observability/log";

/** Server start-up: Sentry for the Node and edge runtimes (it stays off without a DSN). */
export async function register() {
  if (process.env["NEXT_RUNTIME"] === "nodejs") await import("./sentry.server.config");
  if (process.env["NEXT_RUNTIME"] === "edge") await import("./sentry.edge.config");
}

/** Any error while rendering a page or running a route: one structured log line and a Sentry event. */
export const onRequestError: typeof Sentry.captureRequestError = (error, request, context) => {
  log("error", "request_error", {
    path: request.path.split("?")[0],
    method: request.method,
    route: context.routePath,
    route_type: context.routeType,
    router: context.routerKind,
    error_name: error instanceof Error ? error.name : "unknown",
    error_message: error instanceof Error ? error.message : String(error),
    digest: (error as { digest?: string } | null)?.digest,
  });
  Sentry.captureRequestError(error, request, context);
};
