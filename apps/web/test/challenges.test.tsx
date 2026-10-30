// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { decodeChallenge, ChallengeError } from "@meridian/game-kit";
import { ChallengeLanding } from "../components/challenge/ChallengeLanding";
import { ChallengeSummary } from "../components/challenge/ChallengeSummary";
import {
  DEFAULT_CHALLENGE,
  challengeTargets,
  encodeSilhouetteChallenge,
  parseSilhouetteChallenge,
} from "../lib/challenges/silhouette";
import {
  challengeTotals,
  guess,
  newChallengeSession,
  next,
  answer,
  surrender,
} from "../lib/silhouette/controller";
import { silhouetteResult } from "../lib/results/silhouette";
import { ulid } from "../lib/results/ulid";
import { world } from "./fixtures/mini-world";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const SEED = "4KQ2M9XD1A";
const make = (extra: object = {}) =>
  encodeSilhouetteChallenge({
    config: DEFAULT_CHALLENGE,
    seed: SEED,
    contentVersion: "2026.10.0",
    ...extra,
  });

describe("long codes (AC-PL-015)", () => {
  it("round-trip, and stay short", () => {
    const code = make({ senderScore: 18 });
    expect(code.length).toBeLessThan(140);
    const parsed = parseSilhouetteChallenge(code);
    expect(parsed.config).toEqual(DEFAULT_CHALLENGE);
    expect(parsed.payload).toMatchObject({
      v: 1,
      g: "silhouette",
      s: SEED,
      cv: "2026.10.0",
      sc: 18,
    });
  });
  it("a code opened in a fresh context gives the same targets in the same order", () => {
    const a = challengeTargets(world, DEFAULT_CHALLENGE, SEED);
    const b = challengeTargets(
      world,
      parseSilhouetteChallenge(make()).config,
      parseSilhouetteChallenge(make()).payload.s,
    );
    expect(a).toEqual(b);
    expect(a).toHaveLength(5);
    expect(challengeTargets(world, DEFAULT_CHALLENGE, "7TTTTTTTTT")).not.toEqual(a);
  });
  it("rejects another game, a bad seed, unknown config keys and garbage", () => {
    expect(() => parseSilhouetteChallenge("garbage!!")).toThrow(ChallengeError);
    expect(() => parseSilhouetteChallenge(make().slice(0, 12))).toThrow(ChallengeError);
    const other = encodeSilhouetteChallenge as unknown as (x: unknown) => string;
    expect(() =>
      other({ config: { ...DEFAULT_CHALLENGE, n: 7 }, seed: SEED, contentVersion: "2026.10.0" }),
    ).toThrow();
    expect(decodeChallenge(make()).g).toBe("silhouette");
  });
});

describe("a challenge session", () => {
  const targets = challengeTargets(world, DEFAULT_CHALLENGE, SEED);
  const start = () =>
    newChallengeSession(
      world,
      SEED,
      {
        pool: { kind: "sovereign-197" },
        difficulty: "normal",
        followUps: ["capital", "flag"],
        unit: "km",
      },
      { code: make(), targets, sc: 10 },
      1000,
    );

  it("plays the fixed targets in order, then finishes", () => {
    let s = start();
    const seen: string[] = [];
    for (let i = 0; i < 5; i++) {
      seen.push(s.round.targetId);
      s = guess(world, s, world.byId.get(s.round.targetId)!.name, 2000);
      s = answer(s, 0, s.followUps[0]!.prompt.correctIndex);
      s = answer(s, 1, s.followUps[1]!.prompt.correctIndex);
      expect(s.phase).toBe("learn");
      s = next(world, s, 3000);
    }
    expect(seen).toEqual(targets);
    expect(s.phase).toBe("finished");
    expect(challengeTotals(s)).toEqual({ points: 5 * 8, max: 5 * 8, solved: 5 });
    expect(next(world, s)).toBe(s);
  });
  it("totals count the current round once it is over, and a give-up scores nothing", () => {
    let s = surrender(world, start(), 2000);
    s = answer(s, 0, 0);
    s = answer(s, 1, 0);
    expect(challengeTotals(s).points).toBeLessThanOrEqual(0);
    expect(challengeTotals(s).max).toBe(40);
  });
  it("round results are seeded results carrying the challenge code", () => {
    let s = guess(world, start(), world.byId.get(targets[0]!)!.name, 2000);
    s = answer(s, 0, 0);
    s = answer(s, 1, 0);
    const r = silhouetteResult(s, {
      id: ulid(1, new Uint8Array(16)),
      contentVersion: "2026.10.0",
      endedAt: 5000,
    });
    expect(r).toMatchObject({ mode: "seeded", challenge_code: make() });
  });
});

describe("ChallengeSummary", () => {
  const finished = (sc: number | undefined) => {
    const targets = challengeTargets(world, DEFAULT_CHALLENGE, SEED);
    let s = newChallengeSession(
      world,
      SEED,
      {
        pool: { kind: "sovereign-197" },
        difficulty: "normal",
        followUps: ["capital", "flag"],
        unit: "km",
      },
      { code: make(), targets, ...(sc !== undefined ? { sc } : {}) },
      0,
    );
    for (let i = 0; i < 5; i++) {
      s = guess(world, s, world.byId.get(s.round.targetId)!.name, 10);
      s = answer(s, 0, s.followUps[0]!.prompt.correctIndex);
      s = answer(s, 1, s.followUps[1]!.prompt.correctIndex);
      s = next(world, s, 20);
    }
    return s;
  };
  const props = (s: ReturnType<typeof finished>, over = {}) => ({
    session: s,
    config: DEFAULT_CHALLENGE,
    contentVersion: "2026.10.0",
    origin: "https://meridian.example",
    createShort: async () => "SH-4KQ2-M9XD",
    writeClipboard: async () => undefined,
    ...over,
  });

  it("shows the total and a side-by-side verdict against the sender", async () => {
    const { rerender } = render(<ChallengeSummary {...props(finished(30))} />);
    expect(screen.getByText("40 of 40 points · 5 of 5 solved")).toBeInTheDocument();
    expect(screen.getByText(/beat the sender: 40 to 30/)).toBeInTheDocument();
    rerender(<ChallengeSummary {...props(finished(40))} />);
    expect(screen.getByText(/tied the sender at 40/)).toBeInTheDocument();
    rerender(<ChallengeSummary {...props(finished(45))} />);
    expect(screen.getByText(/sender scored 45; you scored 40/)).toBeInTheDocument();
  });
  it("shares a short link with your score, and copies it", async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    render(<ChallengeSummary {...props(finished(undefined), { writeClipboard: write })} />);
    await waitFor(() =>
      expect(screen.getByLabelText("Share this challenge")).toHaveTextContent(
        "https://meridian.example/c/SH-4KQ2-M9XD",
      ),
    );
    expect(screen.getByLabelText("Share this challenge")).toHaveTextContent(
      /Silhouette challenge · 5 shapes\s+40\/40/,
    );
    await userEvent.setup().click(screen.getByRole("button", { name: "Copy link and score" }));
    expect(write).toHaveBeenCalledWith(expect.stringContaining("/c/SH-4KQ2-M9XD"));
    expect(await screen.findByText("Copied to your clipboard.")).toBeInTheDocument();
  });
  it("falls back to the long link when the server can't give a short code, and says so after the round when seen before", async () => {
    const s = finished(undefined);
    render(<ChallengeSummary {...props(s, { createShort: async () => null, seenBefore: true })} />);
    await waitFor(() =>
      expect(screen.getByText("Using the long link, which works offline.")).toBeInTheDocument(),
    );
    expect(screen.getByLabelText("Share this challenge").textContent).toMatch(
      /\/c\/[A-Za-z0-9_-]{20,}/,
    );
    expect(screen.getByText("You've seen this one before.")).toBeInTheDocument();
    const link = screen
      .getByLabelText("Share this challenge")
      .textContent!.match(/\/c\/([A-Za-z0-9_-]+)/)![1]!;
    expect(parseSilhouetteChallenge(link).payload.sc).toBe(40);
  });
});

describe("ChallengeLanding (AC-PL-016)", () => {
  it("opens a long code on the device and offers to start, with the sender's score", async () => {
    render(<ChallengeLanding code={make({ senderScore: 18 })} />);
    expect(await screen.findByText("Beat 18 of 40?")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Start the challenge" })).toHaveAttribute(
      "href",
      `/play/silhouette/challenge?c=${make({ senderScore: 18 })}`,
    );
  });
  it("shows the friendly invalid page for garbage and for an unknown short code", async () => {
    render(<ChallengeLanding code="nonsense-nonsense" />);
    expect(await screen.findByText("That challenge link isn't valid")).toBeInTheDocument();
    cleanup();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 404 })));
    render(<ChallengeLanding code="SH-ZZZZ-ZZZZ" />);
    expect(await screen.findByText("That challenge link isn't valid")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Play Silhouette" })).toBeInTheDocument();
  });
  it("resolves a short code through the API, also when the version has expired (410)", async () => {
    const body = { game_id: "silhouette", payload: make(), content_version: "2026.10.0" };
    for (const status of [200, 410]) {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status })),
      );
      render(<ChallengeLanding code="sh-4kq2-m9xd" />);
      expect(await screen.findByRole("link", { name: "Start the challenge" })).toHaveAttribute(
        "href",
        `/play/silhouette/challenge?c=${make()}`,
      );
      cleanup();
    }
  });
  it("says so when the server can't be reached", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    render(<ChallengeLanding code="SH-4KQ2-M9XD" />);
    expect(await screen.findByRole("alert")).toHaveTextContent(/couldn't reach the server/);
  });
});
