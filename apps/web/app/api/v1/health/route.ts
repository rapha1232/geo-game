import {
  appVersion,
  checkHealth,
  currentContentVersion,
  pingDatabase,
} from "../../../../lib/api/health";
import { handle } from "../../../../lib/api/problem";

export const dynamic = "force-dynamic";

export const GET = handle(() =>
  checkHealth({
    pingDb: pingDatabase,
    contentVersion: currentContentVersion(),
    appVersion: appVersion(),
  }),
);
