# Rank It

| Field | Value |
|---|---|
| Game ID | G-RK |
| Slug / route | `/play/rank-it` |
| Phase | **R2** |
| Inspiration | JetPunk ranking quizzes and Point clicker (Secondary: [REFERENCE_RESEARCH §1](../REFERENCE_RESEARCH.md#1-jetpunk)). Formats, scoring and data-gap rules are Proposed. |
| Depends on | `indicators` pack, `OrderList` component, `ChoiceGrid`, Repeat Guard |
| Governing ACs | AC-RK-001 … AC-RK-012 |

## 1. Purpose and player experience

Build intuition for magnitudes: populations, areas, wealth, elevation and latitude. "Is Egypt bigger than Nigeria?" **Round:** 20–45 s. **Personas:** Completionist, Casual, Learner.

## 2. Rules and complete gameplay loop

Three formats share one engine:

1. **Order** (default): 5 entities and one statistic. Drag them (or use the keyboard) into order from highest to lowest, then **Submit**. One submission (Normal).
2. **Higher / Lower:** a streak game. An entity with its value is shown next to a new entity, and the player picks "Higher" or "Lower". A correct pick continues the streak. The first wrong pick ends the run.
3. **Top Picks:** a 4×4 grid of 16 entities. Pick the top 5 by the statistic, with 5 picks. The score is the sum of rank points (rank 1 = 5 points … rank 5 = 1 point, outside the top 5 = 0), with a maximum of 15. (This is an adaptation of the Point clicker idea.)

## 3. Modes and configuration

| Option | Values | Default |
|---|---|---|
| Format | Order, Higher/Lower, Top Picks | Order |
| Statistic | Population, Area, Population density, GDP per capita, Life expectancy, Highest point, Capital latitude (north → south), Random | Random |
| Scope | World, continent | World |
| Difficulty | Easy, Normal, Hard | Normal |
| Unlimited / Daily / Seeded | — | Unlimited |

## 4. Data requirements

`indicators` records (`value`, `year`, `source_id`). Statistic definitions:

| Statistic | Unit | Source (license) | Sort |
|---|---|---|---|
| Population | people | World Bank WDI `SP.POP.TOTL` (CC BY 4.0) | desc |
| Area | km² | World Bank `AG.SRF.TOTL.K2` (CC BY 4.0) | desc |
| Density | people/km² | Derived | desc |
| GDP per capita | current US$ | World Bank `NY.GDP.PCAP.CD` | desc |
| Life expectancy | years | World Bank `SP.DYN.LE00.IN` | desc |
| Highest point | m | Wikidata P610 → P2044 (CC0), editorially reviewed | desc |
| Capital latitude | ° | `core.countries` capital coordinates | north → south |

Pool: 197 entities × 7 stats gives effectively unlimited combinations.

## 5. Answer validation and interaction rules

- `OrderList`: drag handles (pointer/touch). Keyboard: `Space` picks up an item, arrows move it, `Space` drops it. Screen readers get announcements ("Brazil, moved to position 2 of 5").
- **Separation rule:** any two items in an Order round must differ by **≥ 10%** relative (`|a − b| / max(a, b) ≥ 0.10`), or ≥ 1° for latitude. This prevents ties and noise from data years. Higher/Lower pairs require ≥ 5%.
- Values are shown only after submission.

## 6. Scoring and difficulty

- **Order:** points = the number of correctly ordered pairs out of C(5, 2) = 10, × 10 → max **100**. Example: true order A > B > C > D > E. The player submits A, C, B, D, E → 9 of 10 pairs correct → **90**.
- **Higher/Lower:** points = streak length. The PB is the longest streak.
- **Top Picks:** as in §2 (max 15).
- **Difficulty:** Easy uses the separation threshold ×3 (≥ 30%) and familiar entities (`familiarity > 0.6`). Hard uses a threshold of 10% with values clustered (all 5 drawn from a window of ranks ±15 in the stat).

## 7. Hints and feedback

Hint (Order, once per round, −20 points): reveal the position of one item. After submitting: each row shows the true value, a ✓/✕ icon, and an arrow showing where it belonged. A bar chart of the 5 values is drawn to scale (log scale with a label when the max/min ratio is > 100).

## 8. Screens and state transitions

```
Order by POPULATION (highest first)          [Submit]
 1 ≡ Nigeria
 2 ≡ Brazil
 3 ≡ Japan
 4 ≡ Egypt
 5 ≡ Germany
After submit:  1 Brazil 211M ✓ ... (bars) [Next]
```

States: `arranging` → `SUBMIT` → `revealed` → `NEXT` → `arranging`.

## 9. Edge cases

| Case | Expected behavior |
|---|---|
| A value is missing for an entity | Entity excluded from that stat's pool |
| Different data years across entities | Allowed. The reveal footer says "Values: World Bank, latest available year (2022–2024)". |
| Player submits without moving anything | Scored normally |
| Values change in a content update | Stored results keep their score. History shows the original values. |

## 10. Accessibility and mobile behavior

Keyboard reordering with announcements, plus "Move up/down" buttons on each row on mobile as an alternative to dragging. Values are given as text and bars.

## 11. Unlimited-play and repeat-prevention behavior

The Repeat Guard excludes identical (stat, entity-set) combinations from the last 500 rounds, and keeps the same stat out of more than 2 consecutive rounds when the stat is Random.

## 12. Acceptance criteria

| ID | Given / When / Then | Example |
|---|---|---|
| AC-RK-001 | Pair scoring | A, C, B, D, E vs A > B > C > D > E → 90 |
| AC-RK-002 | Perfect = 100 | Correct order → 100 |
| AC-RK-003 | Reverse = 0 | E, D, C, B, A → 0 |
| AC-RK-004 | Separation rule | Every generated Normal Order round satisfies ≥ 10% relative separation |
| AC-RK-005 | Higher/Lower pair separation | ≥ 5% |
| AC-RK-006 | Keyboard reorder | Space, ArrowUp, Space moves an item up one position and announces it |
| AC-RK-007 | Source footer | The reveal includes the source and year range |
| AC-RK-008 | Top Picks max | Picking ranks 1–5 → 15 |
| AC-RK-009 | Hint cost | Hint used + perfect order → 80 |
| AC-RK-010 | Log scale | Max/min > 100 → bars on a log scale with a "log scale" label |
| AC-RK-011 | Determinism | The same seed gives the same 5 entities and stat |
| AC-RK-012 | Missing data | An entity without a value never appears for that stat |
