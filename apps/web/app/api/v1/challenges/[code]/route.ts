import { drizzleChallengeStore } from "../../../../../lib/api/challenge-store";
import { resolveChallenge } from "../../../../../lib/api/challenges";
import { handle } from "../../../../../lib/api/problem";

export const dynamic = "force-dynamic";

export const GET = handle(async (_req: Request, ctx: { params: Promise<{ code: string }> }) =>
  resolveChallenge((await ctx.params).code, {
    store: drizzleChallengeStore(),
    randomBytes: () => crypto.getRandomValues(new Uint8Array(5)),
    now: () => Date.now(),
  }),
);
