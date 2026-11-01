import type { MetadataRoute } from "next";
import { PRODUCTION_URL } from "../lib/brand";
import { COUNTRIES } from "../lib/countries";
import { LIBRARY } from "../lib/quiz/library";
import { ROUND_QUIZZES } from "../lib/quiz/rounds";
import { SUB_COUNTRIES } from "../lib/subdivisions/list";

/** Every public page: the hubs, each game, each named quiz, each subdivision quiz and each Atlas place. */
export const SITEMAP_PATHS: readonly string[] = [
  "/",
  "/play",
  "/daily",
  "/explore",
  "/play/silhouette",
  "/play/quiz",
  "/play/fact-pin",
  "/play/border-run",
  "/play/rank-it",
  "/play/deep-cut",
  "/play/subdivisions",
  "/play/quiz/daily",
  "/about",
  "/about/rules",
  "/about/sources",
  "/about/corrections",
  "/privacy",
  "/terms",
  ...LIBRARY.map((q) => `/play/quiz/${q.slug}`),
  ...ROUND_QUIZZES.map((q) => `/play/quiz/${q.slug}`),
  ...SUB_COUNTRIES.map((c) => `/play/subdivisions/${c.code.toLowerCase()}`),
  ...COUNTRIES.map((c) => `/explore/country:${c.code}`),
];

export default function sitemap(): MetadataRoute.Sitemap {
  return [...new Set(SITEMAP_PATHS)].map((path) => ({
    url: `${PRODUCTION_URL}${path}`,
    changeFrequency: path === "/" || path === "/daily" ? "daily" : "weekly",
    priority: path === "/" ? 1 : path.startsWith("/explore/country:") ? 0.5 : 0.7,
  }));
}
