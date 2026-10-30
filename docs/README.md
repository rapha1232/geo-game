# Meridian — Product & Technical Blueprint

> **Working title:** *Meridian* (see [OPEN_QUESTIONS_AND_RISKS.md](OPEN_QUESTIONS_AND_RISKS.md#q-01-brand-name) — the name has not been trademark-checked).

Meridian is a geography, history and general-knowledge game platform built around **unlimited replayability**. Every game can be played endlessly with fresh, non-repeating puzzles. Daily challenges exist only as an optional extra. One shell ties the games together: navigation, settings, a local-first profile, statistics and a shared visual language.

This directory is the **implementation blueprint**. It contains specifications, not application code. A coding agent should be able to build the product from these documents without inventing product behavior or making major architectural choices.

## Product summary

| Area | Summary |
|---|---|
| Core promise | Play as long as you like. Choose a topic, configure the session, and get a new non-repeating puzzle every time. |
| Game families | Quiz Library (JetPunk-style typed, map and choice quizzes), Silhouette (shape deduction), Fact Pin (pin a fact on the map), Atlas Explorer (interactive fact map), Deep Cut (find the rare correct answer), Border Run, Rank It, Chronology, Lost Borders, Knowledge Run |
| Accounts | Optional. Everything works for guests, with progress stored on the device. Accounts (Phase 2) add cross-device sync. |
| First release (R1) | Platform shell plus three distinct games: **Quiz Library** (countries, capitals, flags, continents), **Silhouette** and **Fact Pin**. See [IMPLEMENTATION_ROADMAP.md](IMPLEMENTATION_ROADMAP.md#phase-1--first-playable-release-r1). |
| Stack | TypeScript monorepo: Next.js (React) web app, pure-TS game engines, d3-geo map renderer, static versioned content packs, Postgres (only for accounts, results and reports). See [ARCHITECTURE.md](ARCHITECTURE.md). |

## Reading order

1. [PRODUCT_VISION.md](PRODUCT_VISION.md): goals, audience, principles, scope and exclusions.
2. [REFERENCE_RESEARCH.md](REFERENCE_RESEARCH.md): sourced findings on JetPunk, Fact Map, Farflung, Worldle and related games, plus the coverage matrix.
3. [GAME_CATALOG.md](GAME_CATALOG.md): every game family with its evaluation, phase and dependencies.
4. [GAME_SPEC_TEMPLATE.md](GAME_SPEC_TEMPLATE.md): the 12-section format every game spec follows.
5. Game specifications in [`games/`](games/):
   - [quiz-library.md](games/quiz-library.md): **R1**
   - [silhouette.md](games/silhouette.md): **R1**
   - [fact-pin.md](games/fact-pin.md): **R1**
   - [atlas-explorer.md](games/atlas-explorer.md): R2
   - [deep-cut.md](games/deep-cut.md): R2
   - [border-run.md](games/border-run.md): R2
   - [rank-it.md](games/rank-it.md): R2
   - [chronology.md](games/chronology.md): R3
   - [lost-borders.md](games/lost-borders.md): R3
   - [knowledge-run.md](games/knowledge-run.md): R3
6. [UX_AND_DESIGN.md](UX_AND_DESIGN.md): information architecture, layouts, interactions and the visual system.
7. [DATA_AND_CONTENT.md](DATA_AND_CONTENT.md): datasets, licenses, content models and editorial rules.
8. [ARCHITECTURE.md](ARCHITECTURE.md): stack, boundaries, map rendering, generation, state and deployment.
9. [DATA_MODEL.md](DATA_MODEL.md): content-pack schemas, database tables, constraints and examples.
10. [API_CONTRACTS.md](API_CONTRACTS.md): HTTP endpoints and in-process interfaces.
11. [TESTING_AND_ACCEPTANCE.md](TESTING_AND_ACCEPTANCE.md): verification strategy and platform acceptance criteria.
12. [IMPLEMENTATION_ROADMAP.md](IMPLEMENTATION_ROADMAP.md): phased delivery with tasks linked to specs and ACs.
13. [AGENT_HANDOFF.md](AGENT_HANDOFF.md): exact instructions for the coding agent. **Read this first if you are implementing.**
14. [OPEN_QUESTIONS_AND_RISKS.md](OPEN_QUESTIONS_AND_RISKS.md): unresolved decisions, assumptions and risks.

## Conventions used in these documents

| Convention | Meaning |
|---|---|
| **R1 / R2 / R3 / R4** | Release phases. R1 is the first playable public release. Every feature names its phase. |
| `AC-XX-NNN` | Acceptance-criterion ID. Game ACs live in each game spec; platform ACs live in [TESTING_AND_ACCEPTANCE.md](TESTING_AND_ACCEPTANCE.md). |
| `T<phase>.<n>` | Roadmap task ID in [IMPLEMENTATION_ROADMAP.md](IMPLEMENTATION_ROADMAP.md). |
| `country:FRA` | Stable entity ID (see [DATA_MODEL.md](DATA_MODEL.md#stable-identifiers)). |
| **MUST / SHOULD / MAY** | RFC 2119 requirement levels. |
| *Observed* vs *Proposed* | In research and game specs, *Observed* means verified on a reference product. *Proposed* means new to Meridian. |

## Repository workflow

`main` is the single source of truth. All work happens on short-lived branches, lands through pull requests, and PRs are merged automatically once checks pass. See [AGENT_HANDOFF.md](AGENT_HANDOFF.md#git-workflow).
