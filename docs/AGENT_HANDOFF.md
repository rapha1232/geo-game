# Agent Handoff

Instructions for the coding agent implementing Meridian. Read this file completely before writing code.

## Read order

1. This file.
2. [IMPLEMENTATION_ROADMAP.md](IMPLEMENTATION_ROADMAP.md): find your task ID.
3. The task's **governing spec** sections and **ACs** (linked in the task row).
4. [ARCHITECTURE.md](ARCHITECTURE.md) §3–§9 (stack, boundaries, engines, map, generation, state).
5. [DATA_MODEL.md](DATA_MODEL.md) and [API_CONTRACTS.md](API_CONTRACTS.md) for anything persisted or sent over the network.
6. [TESTING_AND_ACCEPTANCE.md](TESTING_AND_ACCEPTANCE.md) §1, §8.

## Git workflow

- **`main` is the single source of truth.** Never commit directly to `main`.
- For each task, create a branch from the latest `main`: `git fetch origin main && git checkout -b <type>/<task-id>-<slug> origin/main` (e.g. `feat/T0.8-name-matcher`). If your environment assigns a branch name, use that one.
- Keep PRs small: one roadmap task (or a coherent part of one) per PR. Target < 800 changed lines excluding generated files and fixtures.
- PR title: `T0.8: Name matcher (norm, exact, fuzzy, prefix-hold)`. PR body: link the governing spec sections, list the ACs covered, and note any deviations.
- **Auto-merge:** after opening a PR, enable auto-merge (squash). If the repository has no required checks yet (very early PRs), merge the PR yourself once local checks pass. The owner has asked that PRs be merged automatically, without waiting for review.
- After merge, start the next task from a fresh `main`. If your branch's PR was already merged, recreate the branch from `main` instead of stacking commits on merged history.
- Never force-push to `main`, never rewrite history on someone else's branch, and never disable or skip tests to get green.

## Non-negotiable rules

1. **Follow the specs exactly.** Formulas, thresholds, IDs, defaults, routes and copy patterns are normative. If a spec is wrong or ambiguous, change the spec **in the same PR**, with a short rationale. Do not silently deviate.
2. **Engines are pure.** `packages/games/*` must not import React, browser APIs, `Date.now()` or `Math.random()`. Time comes in as a monotonic `now` argument, and randomness comes from the seeded `Rng`.
3. **No runtime third-party data APIs.** All data comes from content packs ([DATA_AND_CONTENT §1](DATA_AND_CONTENT.md#1-principles)).
4. **No color-only feedback.** Every state has an icon, a pattern or text.
5. **Every AC gets a test** whose name contains the AC ID.
6. **Accounts are never required** for any gameplay.
7. **Strings go through the i18n function `t()`** from the first component (English only in R1), so R4 localization doesn't require a rewrite.
8. **Do not invent content facts.** Facts, aliases and capitals come from the pipeline sources or from editorial YAML with sources. If you need placeholder content for tests, put it only in fixture packs and mark it `status: draft`.
9. **Licenses:** do not add a dataset, font, icon set or image without adding it to the source registry with a verified license.
10. **No application code in `docs/`.** Contract snippets in the docs are illustrative.

## Implementation guidance per area

| Area | Guidance |
|---|---|
| Name matcher | Build the golden CSV first (≥ 300 rows from [quiz-library §5 and §9](games/quiz-library.md#5-answer-validation-and-interaction-rules)), then implement. Keystroke path: an O(1) hash lookup on `norm(input)`. Fuzzy path: a length-bucketed candidate scan with early exit (keep it < 20 ms). |
| Geo | Use the formulas exactly as written (R = 6371.0088 km, rhumb bearing, `floor` for proximity). Add golden rows for the antimeridian and the poles. |
| GameMap | Start with select mode on 110m, Equal Earth. Add LOD, tiny rings and keyboard navigation next. Free-pin mode comes last. Keep a Storybook-like playground route `/dev/map` (excluded from production builds). |
| Persistence | Implement the session service once in `apps/web/lib/session` and reuse it. Test reload behavior with Playwright (`page.reload()`) and a fake clock. |
| Content pipeline | Pin sources first, and commit `sources.lock.yaml`. Raw downloads are gitignored. Make every step idempotent and deterministic (sorted keys, stable float formatting with 6 decimals for coordinates). |
| UI | Build the components in [UX_AND_DESIGN §4](UX_AND_DESIGN.md#4-interaction-patterns-shared-components) before the game screens. Use React Aria Components for comboboxes, listboxes, dialogs and drag-and-drop. |
| API | Route handlers in `apps/web/app/api/v1/**`. Validate with zod from `packages/schemas`. Return problem+json via the shared helper. |

## Decisions already made (do not re-open without a spec change)

| Topic | Decision | Where |
|---|---|---|
| Default country set | `sovereign-197` (UN 193 + Vatican, Palestine, Kosovo, Taiwan) | [DATA_AND_CONTENT §6](DATA_AND_CONTENT.md#6-what-counts-as-a-country) |
| Distance point | Pole of inaccessibility of the largest polygon | [silhouette §5.3](games/silhouette.md#53-distance-direction-proximity-normative-definitions) |
| Direction | Rhumb-line bearing, 8 sectors | Same |
| Typed acceptance | Exact on keystroke, fuzzy only on Enter, prefix-hold 700 ms | [quiz-library §5](games/quiz-library.md#5-answer-validation-and-interaction-rules) |
| Ambiguous names | No credit, with an explanatory message, unless only one member remains | Same |
| Tiny targets | Hit rings of 10/16 px, a loupe on touch | [quiz-library §5.4](games/quiz-library.md#54-map-interaction-rules-map_click-and-type_prompted-with-highlight) |
| Timer | Active-time, pauses when hidden or on reload | [ARCHITECTURE §9](ARCHITECTURE.md#9-state-management-session-persistence-and-result-storage) |
| Map projection | Equal Earth (world), azimuthal equal-area (silhouettes) | [ARCHITECTURE §6.2](ARCHITECTURE.md#62-projections) |
| Stack | Next.js + TS monorepo, d3-geo, IndexedDB, Postgres (Neon), Vercel | [ARCHITECTURE §3](ARCHITECTURE.md#3-recommended-stack) |
| Disputed areas | De facto base geometry, hatched overlay, any-claimant rule for scoring | [DATA_AND_CONTENT §6.3](DATA_AND_CONTENT.md#63-disputed-areas) |

## Escalate to the owner (don't decide alone)

Anything listed in [OPEN_QUESTIONS_AND_RISKS.md](OPEN_QUESTIONS_AND_RISKS.md) as **Owner decision**, plus:
- adding any third-party service that receives user data,
- any change to the sensitive-content policies (disputes, capitals, sets),
- anything that would make an account or payment required.

## First three PRs (suggested)

1. `T0.1`: scaffold, CI, an empty Next.js app deployed to a Vercel preview.
2. `T0.7` + `T0.9`: `game-kit` and `geo` packages with golden tests (pure TS, fast to verify).
3. `T0.8`: name matcher with the full golden table.
