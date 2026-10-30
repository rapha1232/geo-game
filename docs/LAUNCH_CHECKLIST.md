# R1 launch checklist (T1.21)

What the repository already does, what was checked locally, and what only the owner can do. Nothing here has been deployed from this checklist.

## Checked locally on the release candidate (content 2026.10.0)

| Check | Command | Result |
|---|---|---|
| Lint, types, unit and view tests, formatting | `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm exec prettier --check .` | Pass |
| Production build | `pnpm --filter @meridian/web build` | Pass |
| Content validation, release mode (licences included) | `pnpm --filter @meridian/content-pipeline exec tsx src/cli.ts validate --release` | 0 errors, 4 known warnings (inspected, in `content/overrides/`) |
| Accessibility: axe WCAG 2.2 AA on every route and game state, light and dark, 390 and 1280 px; no horizontal scroll at 320, 390, 768 and 1280 px; touch targets | `pnpm --filter @meridian/web a11y` | No findings |
| JS budgets | `pnpm --filter @meridian/web budget` | Shell 162 KB gzip (limit 170); every game route under 120 KB beyond the shell |
| No third-party requests at runtime (AC-PL-003) | `pnpm --filter @meridian/web network` | Only the app's own origin |
| Home LCP, indicative (simulated slow 4G, 4x CPU) | `pnpm --filter @meridian/web lcp` | About 0.65 s |

Run the audit scripts against `next start -p 3111`.

## Only the owner can do

1. **Neon**: set `DATABASE_URL` in Vercel (production and preview), then `pnpm --filter @meridian/web db:migrate`. Reports and short-code challenges need it. Without it both answer 503 and the games still work with long links.
2. **Cron secret**: set `CRON_SECRET` in Vercel. `vercel.json` schedules `/api/internal/dedupe-reports` daily; it answers 401 without the secret.
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
