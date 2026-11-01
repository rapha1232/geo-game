# Meridian

Geography, history and knowledge games built for **unlimited replayability**. No account needed: progress lives on the device.

**Live:** [meridian-quiz.vercel.app](https://meridian-quiz.vercel.app)

## What's in it

| Game         | Route                | What you do                                                                     |
| ------------ | -------------------- | ------------------------------------------------------------------------------- |
| Quiz Library | `/play/quiz`         | Typed, map, choice, tile and match quizzes on countries, capitals, flags, ranks |
| Silhouette   | `/play/silhouette`   | Name a country from its outline, with distance and direction clues              |
| Fact Pin     | `/play/fact-pin`     | Read a fact, pin where it happened                                              |
| Border Run   | `/play/border-run`   | Cross from one country to another through neighbours                            |
| Rank It      | `/play/rank-it`      | Order countries by population, area, wealth and more                            |
| Deep Cut     | `/play/deep-cut`     | Name a country that fits; the rarer the answer, the higher the score            |
| Subdivisions | `/play/subdivisions` | States and provinces of 12 countries                                            |
| Atlas        | `/explore`           | An interactive fact map with layers, filters, compare and "quiz me"             |

Plus optional dailies (`/daily`), local stats and mastery (`/me`), achievements, opt-in streaks, challenge links and an offline-capable PWA.

## Repository

| Path                     | Contents                                                                                   |
| ------------------------ | ------------------------------------------------------------------------------------------ |
| `apps/web`               | The Next.js app: routes, components, API (`app/api/v1`), audits (`scripts`)                |
| `packages/games/*`       | Pure game engines (no React, no browser APIs, seeded randomness)                           |
| `packages/*`             | Shared `game-kit`, `geo`, `name-matcher`, `schemas` and `ui`                               |
| `tools/content-pipeline` | Builds the versioned content packs from pinned sources                                     |
| `content/`, `data/`      | Editorial YAML (names, facts, sets) and the pinned source snapshots                        |
| `docs/`                  | The product and technical blueprint — normative. Start at [docs/README.md](docs/README.md) |

## Develop

Node 22 and pnpm 10.

```bash
pnpm install
pnpm content:fetch && pnpm content:dev   # fetch the pinned sources, build packs into apps/web/public/content
pnpm dev                                 # http://localhost:3000
```

## Check before merging

CI on GitHub Actions is not available, so run everything locally:

```bash
pnpm verify           # format, lint, types, tests, production build, bundle budget, then site, accessibility, i18n, network and offline audits against `next start`
pnpm verify --quick   # format, lint, types and tests only
```

The browser audits use the pre-installed Playwright Chromium.

## Contributing

Coding agents: read [CLAUDE.md](CLAUDE.md) and [docs/AGENT_HANDOFF.md](docs/AGENT_HANDOFF.md) first. Every task maps to a roadmap ID in [docs/IMPLEMENTATION_ROADMAP.md](docs/IMPLEMENTATION_ROADMAP.md).
