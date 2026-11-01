import { describe, expect, it } from "vitest";
import { DAILY_ROTATION, dailyQuizFor } from "../lib/quiz/daily";
import { defaultConfig } from "../lib/quiz/library";
import { quizResult } from "../lib/quiz/results";
import { quizShare } from "../lib/daily/share";
import {
  newQuizState,
  generateQuiz,
  buildQuizWorld,
  summarize,
  giveUp,
  type QuizEntity,
} from "@meridian/quiz";

describe("Daily quiz", () => {
  it("gives the same quiz and seed for a date, and a valid seed", () => {
    const a = dailyQuizFor("2026-11-05");
    expect(dailyQuizFor("2026-11-05")).toEqual(a);
    expect(a.seed).toBe("2026110500");
    expect(a.seed).toMatch(/^[0-9A-HJKMNP-TV-Z]{10}$/);
  });

  it("rotates through the whole list, one step a day", () => {
    const slugs = Array.from(
      { length: DAILY_ROTATION.length },
      (_, i) => dailyQuizFor(`2026-11-${String(i + 1).padStart(2, "0")}`).quiz.slug,
    );
    expect(new Set(slugs).size).toBe(DAILY_ROTATION.length);
    expect(dailyQuizFor("2026-12-01").quiz.slug).not.toBe(dailyQuizFor("2026-12-02").quiz.slug);
  });

  it("only uses quizzes that exist and finish in one sitting", () => {
    expect(DAILY_ROTATION.length).toBeGreaterThanOrEqual(8);
    for (let d = 1; d <= 30; d++) {
      const q = dailyQuizFor(`2026-11-${String(d).padStart(2, "0")}`).quiz;
      expect(q.format).not.toBe("TYPE_ALL");
    }
  });

  it("records a daily result with its date, no personal best, and a spoiler-free share", () => {
    const entities: QuizEntity[] = Array.from({ length: 30 }, (_, i) => ({
      id: `country:C${String(i).padStart(2, "0")}`,
      name: `Land ${i}`,
      aliases: [],
      type: "country",
      continent: "EU",
      region: null,
      areaKm2: 1,
      capitals: [{ name: `Cap ${i}`, role: "official" }],
      difficulty: {},
      sets: ["sovereign-197"],
    }));
    const world = buildQuizWorld(entities);
    const { quiz, seed } = dailyQuizFor("2026-11-05");
    const q = generateQuiz(
      world,
      {
        ...defaultConfig(quiz),
        format: "MULTIPLE_CHOICE",
        template: "capitals.by-country",
        scope: { kind: "world" },
      },
      seed,
    );
    const s = giveUp(newQuizState(q), 1000);
    const result = quizResult(s, {
      id: "01J00000000000000000000000",
      contentVersion: "2026.10.0",
      seed,
      kind: "daily",
      resumed: false,
      endedAt: Date.now(),
      startedAt: Date.now() - 5000,
      now: 1000,
      dailyDate: "2026-11-05",
    });
    expect(result.mode).toBe("daily");
    expect(result.daily_date).toBe("2026-11-05");
    expect(result.pb_key).toBeUndefined();
    const text = quizShare(result, "https://x.test/daily", quiz.title);
    expect(text).toContain("Daily Quiz · 2026-11-05");
    expect(text).toContain(quiz.title);
    expect(text).not.toContain("Land ");
    expect(summarize(s, 1000).total).toBeGreaterThan(0);
  });
});
