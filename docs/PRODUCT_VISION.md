# Product Vision

## 1. Vision statement

Meridian is the place you open when you want to *get better at knowing the world*, and you can stay as long as you like. It combines map quizzes, geographic deduction, fact-driven map play and history challenges in one coherent product. Every game is endlessly replayable and teaches something after each round.

## 2. Problem

Existing products are excellent but fragmented, and they constrain play:

| Gap observed in the market | Evidence (see [REFERENCE_RESEARCH.md](REFERENCE_RESEARCH.md)) | Meridian response |
|---|---|---|
| Daily-only gating: one puzzle per day, with archives behind paywalls or missing | Worldle archive is Premium-only. Farflung's FAQ says it has no unlimited mode yet. Fact Map leads with five daily questions. | Every game has an **Unlimited** mode as its primary entry. Daily is optional. |
| Quizzes are fixed lists with fixed answer keys, and replaying is identical | JetPunk quizzes are authored static lists. | Quizzes are generated from **templates × scopes × seeds**, with random subsets, review-your-misses sessions and seeded variety. |
| Each game is a separate site with its own stats, settings and accounts | Worldle, Farflung, Fact Map, Travle and Globle are all separate | One shell with shared profile, statistics, mastery and settings |
| Thin learning loop: you see *that* you were wrong, not *why* | Most daily games show the answer only | Every result screen teaches: a map of the answer, key facts, the reasoning behind distance or rarity, and links into Atlas Explorer |
| Accessibility is weak (map-only input, color-only feedback) | Typical of map games | Every map interaction has a keyboard/list alternative. Feedback never relies on color alone. |

## 3. Audience

| Persona | Description | What they need | Primary games |
|---|---|---|---|
| **The Completionist** | Adult quiz enthusiast who likes "name all 197" challenges and chases personal bests | Timed typed quizzes, fair answer acceptance, stats and personal bests | Quiz Library, Rank It |
| **The Daily Puzzler** | Plays word and geo dailies on their phone over coffee | Quick sessions, a shareable result, an optional streak, then *more* if they want it | Silhouette, Fact Pin, Deep Cut |
| **The Learner** | Student, teacher or self-improver building geographic literacy | Untimed practice, spaced review of misses, explanations, no pressure | Quiz Library practice, Atlas Explorer |
| **The History Buff** | Enjoys empires, timelines and "what was here in 1500?" | Date-aware content with honest uncertainty | Chronology, Lost Borders |
| **The Casual Visitor** | Arrives from a shared link | Instant play with no sign-up, understood in 10 seconds | Any shared challenge |

Age assumption: 13 and older (general audience). The product is not designed specifically for children under 13. That would change privacy obligations (see [OPEN_QUESTIONS_AND_RISKS.md](OPEN_QUESTIONS_AND_RISKS.md#q-07-classroom--under-13-use)).

## 4. Product principles

These principles settle design disputes. When two conflict, the earlier one wins.

1. **Play first.** A visitor reaches an interactive puzzle within 2 clicks of the home page and in under 3 seconds on a mid-range phone. No sign-up, modal or tutorial wall comes first.
2. **Unlimited by default.** Every game offers an endless or regenerate-on-demand mode. Daily mode, when present, is a seeded preset of the same game, never a separate and better experience.
3. **Fair and forgiving answer checking.** Accept every reasonable name for the correct answer. Never accept a wrong one. When the input is ambiguous, say so instead of guessing (see [quiz-library.md §5](games/quiz-library.md#5-answer-validation-and-interaction-rules)).
4. **Teach on every result.** Every round ends with what the answer was, where it is, and one or two facts. Every mistake gets an explanation.
5. **Honest data.** Disputed borders, recognition differences and uncertain historical dates are surfaced, not hidden. Every fact has a source.
6. **One product.** Shared shell, design tokens, input components, result templates and stats model. A new game is a plugin to the platform, not a new site.
7. **Accessible and device-agnostic.** Fully playable with keyboard only, touch only, or a screen reader (where the game's nature allows; see per-game §10). Feedback never relies on color alone.
8. **No dark patterns.** No streak-loss anxiety mechanics, loot boxes or forced accounts. Streaks are opt-in and include freeze days.

## 5. Goals and success metrics

Metrics are measured with privacy-preserving, cookieless aggregate analytics (see [ARCHITECTURE.md §12](ARCHITECTURE.md#12-security-and-privacy)).

| Goal | Metric | R1 target (90 days after launch) |
|---|---|---|
| Players keep playing past one puzzle | Median rounds per session | ≥ 4 |
| Unlimited play is the main way to play | Share of rounds played in non-daily modes | ≥ 60% |
| Players return | Week-1 returning-visitor rate (cookieless estimate) | ≥ 20% |
| Answer checking is fair | Answer-dispute reports per 10,000 answers | ≤ 2 |
| Content is accurate | Confirmed content errors open longer than 14 days | 0 at P1 severity |
| Fast | p75 LCP on mobile | ≤ 2.5 s |
| Accessible | WCAG 2.2 AA automated violations on all R1 pages | 0 |

## 6. Scope

### In scope (whole product, phased)

- The game families in [GAME_CATALOG.md](GAME_CATALOG.md), with phases as listed there.
- A guest-first local profile (R1). Optional accounts with cross-device sync (R2).
- Personal statistics, entity mastery, achievements and optional streaks (stats in R1, achievements and streaks in R2).
- Seeded, shareable challenge links (R1).
- Content-correction reports (R1). An editorial admin console (R3).
- An English UI at launch. Answers are accepted in English plus endonyms and common transliterations (R1). Opt-in answer languages: es, fr, de, pt, it, nl (R2). UI localization (R4).
- A responsive web app for desktop, tablet and mobile browsers. Installable PWA with offline play of cached packs (R2).

### Explicit exclusions

| Excluded | Reason | Revisit |
|---|---|---|
| Monetization (ads, premium tiers, paywalls) | Must not shape the core experience. Not a prerequisite for anything. | After R3, as a separate decision. Any model MUST keep all core games and unlimited play free. |
| Real-time multiplayer and public global leaderboards | Cheating, moderation and infrastructure cost. Not needed for the core loop. | R4 at the earliest: friend-only challenge comparisons first |
| User-generated quizzes | Moderation burden, plus answer-key quality is the product's core promise | Not planned |
| Native iOS/Android apps | The PWA covers the need | After R3 |
| Street-level imagery (GeoGuessr-style) | Imagery licensing and cost | Not planned |
| Chat, comments, social feeds | Moderation | Not planned |
| Under-13 targeted experiences | Regulatory (COPPA/GDPR-K) obligations | See open question Q-07 |

## 7. What "unlimited replayability" means concretely

A game meets the platform's unlimited-play bar only if all of the following are true. The criteria are checked per game in each spec's §11.

1. **Regenerable:** pressing "Play again" produces a new puzzle in under 300 ms with no network round trip once the content pack is cached.
2. **Non-repeating:** a puzzle target is not repeated within a defined window, using the Repeat Guard in [ARCHITECTURE.md §8](ARCHITECTURE.md#8-puzzle-generation-reproducibility-and-difficulty).
3. **Configurable:** the player can change at least scope (region or topic) and difficulty.
4. **Adaptive:** a "Practice my weak spots" option draws from entities the player has missed (R1 for Quiz Library, R2 for the other games).
5. **Deep enough:** the content pool supports at least 200 distinct rounds before the Repeat Guard has to relax. Each spec's §4 states the pool size.
