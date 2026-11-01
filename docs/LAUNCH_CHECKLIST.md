# R1 launch checklist (T1.21)

What the repository already does, what was checked locally, and what only the owner can do. Nothing here has been deployed from this checklist.

## Checked locally on the release candidate (content 2026.10.0)

| Check                                                                                                                                                           | Command                                                                           | Result                                                                        |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Lint, types, unit and view tests, formatting                                                                                                                    | `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm exec prettier --check .`        | Pass                                                                          |
| Production build                                                                                                                                                | `pnpm --filter @meridian/web build`                                               | Pass                                                                          |
| Content validation, release mode (licences included)                                                                                                            | `pnpm --filter @meridian/content-pipeline exec tsx src/cli.ts validate --release` | 0 errors, 4 known warnings (inspected, in `content/overrides/`)               |
| Accessibility: axe WCAG 2.2 AA on every route and game state, light and dark, 390 and 1280 px; no horizontal scroll at 320, 390, 768 and 1280 px; touch targets | `pnpm --filter @meridian/web a11y`                                                | No findings                                                                   |
| JS budgets                                                                                                                                                      | `pnpm --filter @meridian/web budget`                                              | Shell 162 KB gzip (limit 170); every game route under 120 KB beyond the shell |
| No third-party requests at runtime (AC-PL-003)                                                                                                                  | `pnpm --filter @meridian/web network`                                             | Only the app's own origin                                                     |
| Home LCP, indicative (simulated slow 4G, 4x CPU)                                                                                                                | `pnpm --filter @meridian/web lcp`                                                 | About 0.65 s                                                                  |

Run the audit scripts against `next start -p 3111`. `pnpm --filter @meridian/web offline` checks that every R1 game opens with the network off (the service worker, T2.4).

## Only the owner can do

1. **Neon**: set `DATABASE_URL` in Vercel (production and preview), then `pnpm --filter @meridian/web db:migrate`. Reports and short-code challenges need it. Without it both answer 503 and the games still work with long links.
2. **No cron** (free hosting plan): the report dedupe runs on report submission, at most hourly per warm instance. Other scheduled jobs in ARCHITECTURE §10 run as manual `pnpm` commands or in CI-free local scripts.
3. **Content release**: run `pnpm content:build --out <dir>` for `2026.10.0` and upload with the pipeline's upload command (needs the Blob token). Set `NEXT_PUBLIC_CONTENT_HOST` to the content origin. Until then the app serves the packs from `/content` of its own origin only in development; a production build needs them uploaded or copied into `apps/web/public/content`.
4. **Vercel WAF rate limits**: create the rules listed in `apps/web/lib/api/rate-limits.ts` (reports 10/min and 50/day per IP, challenges 30/min). The in-app limiter is best-effort for one warm instance only.
5. **Sentry** and **analytics**: not wired. Both need an account and a DSN or site ID from the owner, and a decision on consent wording before any telemetry is sent (Privacy page currently says none is collected). Add `NEXT_PUBLIC_SENTRY_DSN` and the analytics script only after the Privacy Policy is updated in the same change.
6. **Uptime checks**: point a monitor at `/api/v1/health`.
7. **Domain and legal**: set the production domain in `lib/brand.ts` if it is not final, and have the Terms and Privacy text reviewed (Q-06).
8. **Manual accessibility pass**: `docs/MANUAL_A11Y_CHECKLIST.md`, with NVDA and VoiceOver.
9. **Lighthouse**: run the Moto G Power mobile profile on Home and the three game hubs for the AC-PL-002 gate; the local LCP script is only a guard.
10. **Test data**: a test challenge row may exist in the Neon `challenges` table from earlier checks. Delete rows you do not recognise before launch.

## Known content gaps (not blockers for the code, but for R1 exit)

- The curated fact bank has 118 facts against the quota of 400 (50 per category, continents at least 10% each). See `content/facts/README.md`. Generated capital and city facts fill the gap in volume, not in editorial range.
- Fact Pin daily no-repeat window is 14 days, not 365, until the bank grows (specs updated).
- The territories set is not built, so the territories option is absent from Settings.
- Facts need a second editor's review before they count as verified; the validator flags unreviewed ones.
- Sounds (Settings) wait for audio assets.

## R2 additions (built after the R1 checklist)

What is in the code now, and what only the owner can do.

**Built and checked locally:** Border Run (with a daily), Rank It, Deep Cut, the Atlas (`/explore`), the Daily Quiz, tile and match quizzes, lives, extra answer languages, Silhouette's neighbours follow-up and heat-map assist, achievements and opt-in streaks, the offline service worker, and anonymous answer statistics (off by default).

**Owner to do:**

1. **Database:** done on the Neon database behind `DATABASE_URL` (2026-11-01). Migration `0001_telemetry` added `answer_events` and `calibration_stats`, and the endpoint was checked end to end (insert, roll-up, cleanup). The migration journal was empty although `0000_init` had been applied some other way, so `0000` was recorded in it first; `db:migrate` now runs cleanly. Run `pnpm --filter @meridian/web db:migrate` for any other database (preview, production) before deploying. The `challenges` table still holds one test row from earlier checks.
2. **Telemetry consent:** it is off by default and the Privacy Policy now describes it. Decide whether to keep it opt-in, and have the wording reviewed (Q-06). Rate limit for `/api/v1/telemetry`: 120 per minute per IP (see `rate-limits.ts`).
3. **Reviews before launch:** the official-language data behind Deep Cut (Wikidata, unreviewed), the translated country names (Wikidata labels; collisions are dropped automatically), the four crossing links, and the Deep Cut equator override.
4. **Content release:** rebuild with `pnpm content:build` and upload as before. New packs: `core.crossings`, `core.indicators`, `deepcut.prompts`, `daily.border-run`. New snapshots are pinned in `data/sources.lock.yaml`.
5. **Not built, needs an account or a service:** sign-in and sync (T2.1 to T2.3), background sync of results, and Sentry or analytics.
6. **Not built, needs more data:** Flags and Water prompt families for Deep Cut, the Atlas layers for urban population, forest area, elevation, driving side, languages and currencies, subdivision packs (T2.13) and the cities pack (T2.14).
7. **No cron:** the report dedupe and the telemetry roll-up run on request instead; the content calibration release is a manual command.
