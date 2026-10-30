# Testing and Acceptance

## 1. Strategy

| Layer | Tool | Scope | Runs |
|---|---|---|---|
| Unit | Vitest | Pure functions: `norm`, matcher, geo math, PRNG, Repeat Guard, timers, scoring, generators, reducers, codecs | Every push |
| Property | fast-check (inside Vitest) | Determinism, invariants (scores in range, no repeats within a window, separation rules) | Every push |
| Golden / fixture | Vitest + committed fixtures | Name-matching table (≥ 300 rows), distance/bearing table, scoring tables from the specs | Every push |
| Content validation | `pnpm content:validate` | Rules in [DATA_AND_CONTENT §10](DATA_AND_CONTENT.md#10-validation-rules-content-ci) | On content or pipeline change, and nightly |
| Component | Vitest + Testing Library (jsdom) | `AnswerInput`, `ChoiceGrid`, `OrderList`, `TimerBadge` keyboard behavior | Every push |
| Integration (API) | Vitest + a Postgres test container (or Neon branch) | Route handlers, validation, rate-limit headers, merge semantics | Every push touching `apps/web/app/api` or `schemas` |
| E2E | Playwright (Chromium, WebKit, Firefox) against the preview deployment | Every AC tagged `[e2e]`, plus the critical journeys (§6) | Every PR |
| Accessibility | @axe-core/playwright + manual screen-reader checklist | All routes, all game states | Every PR (axe). Manual per release. |
| Performance | Lighthouse CI + bundle-size budgets + Vitest bench | [ARCHITECTURE §13](ARCHITECTURE.md#13-performance-targets) | Every PR (budgets), nightly (Lighthouse on prod) |
| Visual regression | Playwright screenshots of key screens (light/dark, 390/768/1280) | Catch design-token regressions | Every PR (non-blocking in R1, blocking from R2) |

**Test data:** a pinned **fixture content pack** (`packages/schemas/fixtures/content-2026.11.0-test`) generated from the real pipeline with a fixed source lock. Tests never depend on live sources.

**Traceability:** every test that verifies an AC includes the AC ID in its name, e.g. `test("AC-QZ-005 prefix-hold accepts Niger after 700ms", …)`. The CI script `scripts/ac-coverage.ts` lists ACs from the docs (regex `AC-[A-Z]{2}-\d{3}`) and fails if any AC of the **current phase** lacks a test (except ACs tagged `[manual]`).

## 2. Required golden tables

| Table | Rows (min) | Source of truth |
|---|---|---|
| `name-matching.golden.csv`: input, universe, context, strictness → expected `MatchResult` | 300 | [quiz-library §5](games/quiz-library.md#5-answer-validation-and-interaction-rules), §9 edge cases |
| `geo.golden.csv`: point pairs → km, bearing, sector, proximity | 40 | [silhouette §5.3](games/silhouette.md#53-distance-direction-proximity-normative-definitions), including antimeridian, poles and sector boundaries |
| `factpin-scoring.golden.csv`: precision, d, hints → score | 30 | [fact-pin §6](games/fact-pin.md#6-scoring-and-difficulty) |
| `deepcut-tiers.golden.json`: prompt answers + priors → tiers | 20 prompts (k = 4…30) | [deep-cut §6.2](games/deep-cut.md#62-rarity-computation-published-in-the-how-rarity-works-help-page) |
| `challenge-codes.golden.json`: payload ↔ code | 20 | [ARCHITECTURE §8.4](ARCHITECTURE.md#84-challenge-codes) |
| `prng.golden.json`: seed + label → first 20 uint32 | 10 | Cross-engine determinism (run in Chromium, WebKit, Firefox and Node) |

## 3. Platform acceptance criteria

| ID | Given / When / Then | Phase |
|---|---|---|
| AC-PL-001 | From `/`, a first-time visitor reaches an interactive puzzle in ≤ 2 clicks (Home → "Play something now" = 1 click) | R1 |
| AC-PL-002 | Home LCP ≤ 2.5 s (Lighthouse mobile, simulated 4G, Moto G Power) | R1 |
| AC-PL-003 | No route makes a request to a third-party data API at runtime (Playwright network log allowlist: self, content host, analytics, Sentry) | R1 |
| AC-PL-004 | All R1 routes have 0 axe violations (WCAG 2.2 A/AA rules) in light and dark mode at 390 and 1280 px | R1 |
| AC-PL-005 | Every text/background token pair meets the contrast minimums in [UX_AND_DESIGN §5.2](UX_AND_DESIGN.md#52-design-tokens) (automated token test) | R1 |
| AC-PL-006 | No horizontal page scroll at 320, 390, 768 and 1280 px on any R1 route | R1 |
| AC-PL-007 | Every interactive element has a visible focus indicator ≥ 3:1 against adjacent colors | R1 |
| AC-PL-008 | Every feedback state on maps uses a pattern or icon in addition to color (visual test with a grayscale filter: correct, missed and near remain distinguishable) | R1 |
| AC-PL-009 | `prefers-reduced-motion: reduce` disables all transform/position animations (computed-style check) | R1 |
| AC-PL-010 | Guest play: completing a Silhouette round with storage available writes a result, and `/me` shows "1 round" without any sign-in | R1 |
| AC-PL-011 | Storage unavailable (IndexedDB blocked): games are playable, and the banner "Your browser isn't letting us save progress" is shown | R1 |
| AC-PL-012 | Interrupted session: reload during any R1 game → resume prompt. Resume restores state with the timer within ±1 s (fake clock). | R1 |
| AC-PL-013 | Home shows a "Continue" card for a resumable session ≤ 7 days old, and not for an 8-day-old one | R1 |
| AC-PL-014 | Offline (R1): with packs cached, going offline mid-session lets the round finish. An uncached game shows "Available when you're back online". | R1 |
| AC-PL-015 | Challenge long code: a generated link opened in a fresh browser context reproduces identical puzzle content (same targets in the same order) | R1 |
| AC-PL-016 | Challenge short code: `POST /challenges` then `/c/<code>` redirects to the same puzzle. An unknown code shows the friendly invalid-link page. | R1 |
| AC-PL-017 | Expired content version in a challenge → `410` → the UI offers "approximately the same" | R1 |
| AC-PL-018 | Report dialog submits with context (game, seed, content version, input), and the API returns 202. An 11th report within 1 minute from the same IP returns 429 with `Retry-After`. | R1 |
| AC-PL-019 | Catalog search returns "Countries of the World" for the query "countries world" in < 50 ms, and filters combine with AND | R1 |
| AC-PL-020 | Favorites persist across reloads (local) | R1 |
| AC-PL-021 | Settings: switching units to miles changes Silhouette distances (865 km → 537 mi) | R1 |
| AC-PL-022 | `/about/sources` lists every source in the current manifest's license summary with attribution text | R1 |
| AC-PL-023 | Export my data (guest) downloads JSON that, when imported into a fresh profile, reproduces stats on `/me` | R1 |
| AC-PL-024 | Daily is never required: the Home "Today" module is below the games module, and completing a daily shows "Keep playing" as the primary action | R1 |
| AC-PL-025 | CSP header present and matches [ARCHITECTURE §12](ARCHITECTURE.md#12-security-and-privacy). No inline scripts without a nonce. | R1 |
| AC-PL-026 | Determinism across engines: `prng.golden.json` passes in Chromium, WebKit, Firefox and Node | R1 |
| AC-PL-027 | Sign-in (R2): guest data merges on first sign-in. Results union by ID with no duplicates. Favorites union. | R2 |
| AC-PL-028 | Sync idempotency: uploading the same batch twice yields `duplicates` for every ID on the second call, and no duplicate rows | R2 |
| AC-PL-029 | Account deletion removes all user rows (checked by a query across all user-owned tables) and nulls report links | R2 |
| AC-PL-030 | PWA (R2): after one online visit, all R1 games are playable in airplane mode, and results sync when back online | R2 |
| AC-PL-031 | Streaks are off by default, and enabling them shows streaks only on `/me` | R2 |
| AC-PL-032 | Achievements: unlocking ACH-SH-FIRST happens immediately after a first-guess Silhouette solve, and it appears on `/me/achievements` | R2 |
| AC-PL-033 | Telemetry opt-out stops all calls to `/telemetry/answers` (network log) | R2 |
| AC-PL-034 | Admin routes return 403 for `role=player` | R3 |

## 4. Content acceptance

- All validator rules pass with 0 errors for a release build.
- The R1 content checklist:
  - `sovereign-197` = 197, `un-193` = 193 (SET_COUNT).
  - Every R1 country has: canonical name, ≥ 1 alias where applicable, flag SVG, capital(s) with roles, 110m/50m/10m geometry, `ref_point`, silhouette, adjacency (may be empty), population and area values.
  - ≥ 400 curated facts meeting the quotas. Every fact has sources.
  - Daily schedules ≥ 365 days ahead for Silhouette and Fact Pin.
  - The alias golden table covers every `former` alias and every ambiguity group.
- **Editorial spot audit** `[manual]` per release: 30 random facts and 30 random entities are checked by an editor against sources. More than 2 defects blocks the release.

## 5. Accessibility verification

| Check | Method | Frequency |
|---|---|---|
| Automated rules | axe on every route and each game state (configure, playing, review) | Every PR |
| Keyboard-only journeys | Playwright scripts: AC-QZ-024, AC-FP-012, AC-AE-014 | Every PR |
| Screen reader | `[manual]` NVDA + Firefox, VoiceOver + Safari (macOS and iOS): play one round of each R1 game with the accessible variants | Per release |
| Zoom 200% / text spacing | `[manual]` + a Playwright text-spacing bookmarklet check | Per release |
| Forced colors | Playwright `forcedColors: 'active'` screenshots: patterns visible | Every PR |
| Touch targets | Automated check: all `button, a, [role=button]` ≥ 44×44 CSS px on mobile | Every PR |

## 6. Critical E2E journeys (R1)

1. **New visitor quick play:** Home → Play something now → finish a Silhouette round → Play again (new target).
2. **Countries of the World:** start timed → type 10 answers (including `ivory coast`, a fuzzy `kyrgystan`, and `congo` producing the ambiguity message) → reload → resume → give up → review shows missed items hatched → Practice my misses.
3. **Find the Country (MAP_CLICK) on a touch device emulation (iPhone 14):** tap a tiny-target ring (Tuvalu), with a wrong tap first.
4. **Fact Pin run of 5:** place, move and confirm pins → summary → share link → open the link in a new context → the same 5 facts.
5. **Daily Silhouette:** complete → reload → summary persists → Keep playing.
6. **Offline:** play once online, go offline, start a new Unlimited Silhouette round successfully.
7. **Report a problem** from a quiz review.

## 7. Browser and device matrix

| Tier | Browsers / devices | Requirement |
|---|---|---|
| A (blocking) | Latest 2 versions of Chrome, Edge, Firefox and Safari (macOS); iOS Safari 17+; Android Chrome (latest) | All ACs pass |
| B (best effort) | Samsung Internet (latest), Firefox Android | Critical journeys pass |
| Viewports | 320, 390, 768, 1024, 1280, 1920 px | No overflow. Layouts per [UX_AND_DESIGN §6](UX_AND_DESIGN.md#6-responsive-layouts). |

## 8. Definition of done (per task)

A roadmap task is done when:
1. The code implements the governing spec sections referenced by the task.
2. Tests named with the task's AC IDs exist and pass in CI.
3. Lint, typecheck, unit, E2E, axe and budgets are green.
4. Docs are updated if behavior intentionally deviates (the spec is changed in the same PR, with a rationale).
5. The PR is merged to `main` (auto-merge after checks).

## 9. Release exit criteria

| Release | Exit criteria |
|---|---|
| **R1** | All AC-QZ (except those tagged R2+), AC-SH, AC-FP and AC-PL-001…026 pass. Content acceptance (§4) passes. The manual accessibility checklist passes. Lighthouse budgets are met. No open S1 or S2 defects. `/about/privacy` and `/about/sources` are published. |
| **R2** | R1 criteria still pass. All ACs for Atlas Explorer, Deep Cut, Border Run and Rank It, the R2 quiz categories, and AC-PL-027…033. |
| **R3** | All ACs for Chronology, Lost Borders and Knowledge Run, AC-PL-034, and Q-04 resolved. |
