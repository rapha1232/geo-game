# Knowledge Run

| Field | Value |
|---|---|
| Game ID | G-KR |
| Slug / route | `/play/knowledge-run` |
| Phase | **R3** (requires ≥ 6 games that implement the micro-round interface) |
| Inspiration | Original (Proposed) |
| Depends on | The `MicroRound` interface of every game ([ARCHITECTURE §5.3](../ARCHITECTURE.md#53-game-module-contract)), Timer service, Repeat Guard |
| Governing ACs | AC-KR-001 … AC-KR-012 |

## 1. Purpose and player experience

An endless, varied gauntlet that mixes every topic: shape, fact, ranking, history, flags. It rewards all-round knowledge and keeps sessions fresh. **Run:** 3–15 min. **Personas:** Completionist, Casual.

## 2. Rules and complete gameplay loop

1. The run starts with **3 lives** and level 1.
2. Each round is a **micro-round** from a randomly chosen game. A micro-round is a single prompt resolved in ≤ 30 s.
3. A round is **passed** or **failed** by its micro-round pass rule (§4). A failure costs 1 life.
4. Every 5 rounds, the level increases by 1. The difficulty used to generate micro-rounds increases (levels 1–2 Easy, 3–5 Normal, 6+ Hard).
5. The run ends at 0 lives. The summary shows rounds, score, the best level, and per-topic accuracy.

## 3. Modes and configuration

| Option | Values | Default |
|---|---|---|
| Topics | Geography, History, Mixed | Mixed |
| Timer per round | 30 s, 20 s, Off | 30 s |
| Lives | 3, 1 (sudden death) | 3 |
| Unlimited / Daily (same seed for all) / Seeded | — | Unlimited |

## 4. Data requirements

Micro-round definitions:

| Game | Micro-round | Pass rule | Base points |
|---|---|---|---|
| Quiz Library | 1 MC item (flag, capital, country) | correct | 100 |
| Silhouette | Shape with **3** guesses | solved | 100 + 50 × unused guesses |
| Fact Pin | 1 fact | score ≥ 500 | score / 5 |
| Rank It | Order 4 | ≥ 5/6 pairs | 100 × pairs / 6 |
| Deep Cut | 1 prompt, 30 s | any valid answer | tier points / 5 |
| Border Run | Route with m = 1–2 and budget m + 2 | won | 150 |
| Chronology | Order 4 | all correct | 150 |
| Lost Borders | Identify with MC | correct | 120 |

## 5. Answer validation and interaction rules

Each micro-round uses its game's validation rules and components unchanged. The run shell provides the header (lives, level, score, timer) and transitions between rounds.

## 6. Scoring and difficulty

`runScore = Σ basePoints × (1 + 0.1 × (level − 1))`. Example: a level-3 round scoring 100 base → 120. Game selection is weighted toward games the player has played least, never choosing the same game three times in a row.

## 7. Hints and feedback

No hints. After each round: a 1.5 s pass/fail banner (icon + text), then a "Why?" link that opens the round's reveal in a drawer without pausing the run (the timer starts only when the next round renders).

## 8. Screens and state transitions

```
┌──────────────────────────────────────────┐
│ Knowledge Run  ♥♥♡  Level 3  Score 1,240 │
│ [ micro-round UI of the selected game ]  │
└──────────────────────────────────────────┘
```

States: `round` → (`pass` | `fail`) → `round` | `over` → `summary`.

## 9. Edge cases

| Case | Expected behavior |
|---|---|
| A game's pack fails to load mid-run | Skip that game for the rest of the run, with a toast. No life lost. |
| The player refreshes | The run resumes at the same round (state saved after each round) |
| A tab is hidden mid-round | Round timer paused |

## 10. Accessibility and mobile behavior

The run uses only micro-rounds that have a non-map alternative when "Accessible variants" is on (Silhouette with descriptions, Fact Pin with place-by-search, and so on). The lives count is given as text ("2 lives left"), not only hearts.

## 11. Unlimited-play and repeat-prevention behavior

Each game's Repeat Guard applies to its micro-rounds. Runs are endless until lives run out.

## 12. Acceptance criteria

| ID | Given / When / Then | Example |
|---|---|---|
| AC-KR-001 | Lives | 3 failures → run over |
| AC-KR-002 | Level-up | After round 5 → level 2 |
| AC-KR-003 | Multiplier | Level 3, base 100 → 120 |
| AC-KR-004 | No 3 consecutive rounds from the same game | Over 10,000 simulated rounds |
| AC-KR-005 | Fact Pin pass threshold | 499 → fail, 500 → pass |
| AC-KR-006 | Silhouette micro scoring | Solved on guess 2 → 150 |
| AC-KR-007 | Refresh resume | Reload at round 12 → resumes at round 12 with the same lives and score |
| AC-KR-008 | Pack failure skip | A simulated Chronology pack failure → no life lost, Chronology excluded |
| AC-KR-009 | Daily seed | All players get the same sequence of round seeds for a date |
| AC-KR-010 | Accessible variants | With accessible variants on, no round requires map pointing |
| AC-KR-011 | Lives as text | Screen reader announces "2 lives left" |
| AC-KR-012 | Timer starts on render | The round timer starts only after the round UI is visible |
