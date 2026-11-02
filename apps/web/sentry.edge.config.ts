import * as Sentry from "@sentry/nextjs";
import { sentryBaseOptions, sentryDsn } from "./lib/observability/sentry-options";

Sentry.init(sentryBaseOptions(sentryDsn()));
