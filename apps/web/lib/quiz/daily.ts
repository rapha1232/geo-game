import { LIBRARY, type NamedQuiz } from "./library";

const DAY_MS = 86_400_000;

/**
 * Quizzes the Daily rotates through (quiz-library §3, R2): short, one-sitting rounds across the templates, in a fixed
 * order so the same date gives the same quiz to everyone.
 */
export const DAILY_ROTATION: readonly string[] = [
  "capital-to-country-world",
  "find-countries-world",
  "flags-multiple-choice",
  "capitals-of-europe",
  "continents-map",
  "find-countries-africa",
  "flags-of-asia",
  "capitals-of-south-america",
  "world-regions-map",
  "find-countries-europe",
].filter((slug) => LIBRARY.some((q) => q.slug === slug));

const dayNumber = (date: string): number => Math.floor(Date.parse(`${date}T00:00:00Z`) / DAY_MS);

/** The daily quiz for a local date: the slug and a seed made from the date, so every player gets the same items. */
export function dailyQuizFor(date: string): { quiz: NamedQuiz; seed: string } {
  const slug = DAILY_ROTATION[
    ((dayNumber(date) % DAILY_ROTATION.length) + DAILY_ROTATION.length) % DAILY_ROTATION.length
  ] as string;
  const quiz = LIBRARY.find((q) => q.slug === slug) as NamedQuiz;
  return { quiz, seed: date.replaceAll("-", "").padEnd(10, "0") };
}
