# Border Run

| Field | Value |
|---|---|
| Game ID | G-BR |
| Slug / route | `/play/border-run` |
| Phase | **R2**. Regional variants (e.g. US states) arrive in R2 with the subdivision packs. |
| Inspiration | Travle (Observed: [REFERENCE_RESEARCH §5](../REFERENCE_RESEARCH.md#5-other-relevant-products)): connect a start and end country through intermediate guesses, with outline and initials hints. Feedback tiers, scoring, crossings and the guess budget are **Proposed**. |
| Depends on | `core.adjacency`, `core.crossings` (curated sea links), Name Matcher, `GameMap`, Repeat Guard |
| Governing ACs | AC-BR-001 … AC-BR-013 |

## 1. Purpose and player experience

Learn neighbor relationships and regional layout by routing overland: "From Spain to Poland in as few countries as possible." **Round:** 1–3 min. **Personas:** Completionist, Learner.

## 2. Rules and complete gameplay loop

1. Start country **A** and end country **B** are shown on a map where every country is outlined but unlabeled. A and B are filled and labeled.
2. Let **L** = the length of the shortest land path (number of borders crossed) in the graph, and **m = L − 1** the minimum number of intermediate countries.
3. The player names countries (typed, via the Name Matcher) in any order. Each valid guess is revealed on the map and classified (§7).
4. **Win:** the set {A, B} ∪ guesses contains a connected path from A to B.
5. **Guess budget:** `m + 4` (Normal). If the budget runs out, the round is lost and a shortest path is revealed.
6. Invalid names and duplicates don't consume guesses. A guess can be any country, including off-route ones (which consume a guess).

## 3. Modes and configuration

| Mode | Description | Phase |
|---|---|---|
| Unlimited | Endless rounds | R2 |
| Daily | One route per local date | R2 |
| Practice | Unlimited budget, free hints | R2 |
| Regional | Subdivision graphs (US states, etc.) | R2 |

| Option | Values | Default |
|---|---|---|
| Region | World, a single continent | World |
| Route length (m) | Easy 2–3, Normal 3–5, Hard 5–8 | Normal |
| Allow sea crossings | Off, On (`core.crossings`) | Off |

## 4. Data requirements

- `core.adjacency`: an undirected land-border graph between countries in the active set, derived from 1:10m geometry intersection (a shared boundary ≥ 0.5 km) plus editorial overrides (e.g. the Spain–Morocco borders at Ceuta and Melilla count; France–Brazil and France–Suriname via French Guiana count). Each edge has `{a, b, length_km, via?: "French Guiana"}`.
- `core.crossings`: curated sea, tunnel and bridge links, e.g. `GBR–FRA (Channel Tunnel)`, `DNK–SWE (Øresund Bridge)`, `ESP–MAR (Strait of Gibraltar, 14 km)`, `SAU–BHR (King Fahd Causeway)`, `MYS–SGP (Johor–Singapore Causeway)`. Each has a type and source.
- Pool: every pair (A, B) in the same connected component with m in the configured range. The world graph yields over 10,000 pairs.

## 5. Answer validation and interaction rules

Guesses use the Name Matcher over the countries universe. The map is a passive display: clicking a country does **not** guess it (that would make the game trivial). Hovering a revealed country shows its name.

## 6. Scoring and difficulty

- Win with `g` guesses: `points = max(1, 10 − (g − m) × 2 − hints × 2)`. A perfect run (g = m) is 10.
- Loss: 0.
- Example: m = 3, won with 5 guesses and 1 hint → 10 − 4 − 2 = **4**.

## 7. Hints and feedback

| Guess classification | Rule (dist = BFS hop distance) | Display |
|---|---|---|
| **On a shortest route** | dist(A, c) + dist(c, B) = L | Solid fill + ✓ "On route" |
| **Near** | = L + 1 | Dotted fill + ◐ "Close" |
| **Off route** | > L + 1, or unreachable | Hatched fill + ✕ "Off route" |

| Hint (2 points each) | Effect |
|---|---|
| Next outline | Bold outline of one unrevealed country adjacent to the current connected frontier that lies on a shortest route |
| Initials | Shows the first letters of one shortest route's intermediates, e.g. "F · G · C" |
| Reveal one | Reveals one shortest-route intermediate (counts as a guess) |

## 8. Screens and state transitions

```
┌───────────────────────────────────────────────┐
│ Border Run   Spain → Poland   Guesses 2 / 7   │
│  MAP: Spain, Poland filled; France ✓, Italy ✕ │
│ [ Type a country… ]           [Hint ▾]        │
│ France ✓ On route · Italy ✕ Off route         │
└───────────────────────────────────────────────┘
```

States: `routing` → (`GUESS` | `HINT`) → `routing` | `won` | `lost` → `review` (shows all shortest paths, max 5 listed) → `NEXT`.

## 9. Edge cases

| Case | Expected behavior |
|---|---|
| Island countries (Japan, Iceland) with crossings off | Never chosen as endpoints. Guessable, but always "Off route". |
| Multiple shortest routes | Any of them completes the round. The review lists up to 5. |
| The player completes a longer (non-shortest) path | Win. Score reflects guesses used. |
| Guessing A or B | "Already on the map", not consumed |
| Spain → Morocco with crossings off | Valid via the Ceuta/Melilla land border, so L = 1 is excluded (m ≥ 2 required) |

## 10. Accessibility and mobile behavior

Typed input is primary, so the game is fully keyboard and screen-reader playable. After each guess, the reader announces "France: on route. Connected path: Spain, France." A text list view of the current connected components is always available.

## 11. Unlimited-play and repeat-prevention behavior

Pairs are drawn uniformly within the configured m range. The Repeat Guard excludes pairs seen in the last 200 rounds and any endpoint used in the last 5 rounds. The daily schedule is precomputed for 365 days (with no endpoint repeated within 14 days).

## 12. Acceptance criteria

| ID | Given / When / Then | Example |
|---|---|---|
| AC-BR-001 | L computed by BFS | Spain → Poland → L = 3 (Spain–France–Germany–Poland), m = 2 |
| AC-BR-002 | Win on a connected path | Guess France, Germany → win with g = 2 → 10 points |
| AC-BR-003 | Classification | Spain → Poland: Italy → "Off route" (dist 2 + 3 = 5 > L + 1 = 4); Switzerland → "Close" (2 + 2 = 4 = L + 1) |
| AC-BR-004 | Budget | m = 2 → budget 6. After 6 non-winning guesses → lost, path revealed. |
| AC-BR-005 | Invalid guess not consumed | "Narnia" → counter unchanged |
| AC-BR-006 | Endpoint guess not consumed | Guessing "Spain" → "Already on the map" |
| AC-BR-007 | French Guiana edge | France–Brazil adjacency exists with `via: "French Guiana"` |
| AC-BR-008 | Islands are not endpoints with crossings off | Over 10,000 generated rounds, no endpoint is in an isolated component |
| AC-BR-009 | Crossings on | GBR → BEL becomes valid with L = 2 via FRA (Channel Tunnel) |
| AC-BR-010 | Scoring formula | m = 3, g = 5, 1 hint → 4 |
| AC-BR-011 | Determinism | The same seed gives the same A and B |
| AC-BR-012 | Repeat Guard | 200 rounds → no repeated pair |
| AC-BR-013 | Screen reader announcement after a guess | Includes the classification word |
