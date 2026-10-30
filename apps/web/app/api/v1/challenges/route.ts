import { drizzleChallengeStore } from "../../../../lib/api/challenge-store";
import { createChallenge } from "../../../../lib/api/challenges";
import { handle } from "../../../../lib/api/problem";

export const dynamic = "force-dynamic";

export const POST = handle((req: Request) =>
  createChallenge(req, {
    store: drizzleChallengeStore(),
    randomBytes: () => crypto.getRandomValues(new Uint8Array(5)),
    now: () => Date.now(),
  }),
);
