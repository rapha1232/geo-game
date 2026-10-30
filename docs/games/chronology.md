# Chronology

| Field | Value |
|---|---|
| Game ID | G-CH |
| Slug / route | `/play/chronology` |
| Phase | **R3** |
| Inspiration | Timeline-ordering games in general (e.g. Timdle, which is listed as similar on game directories; not researched in depth). Everything here is **Proposed**. |
| Depends on | `events` pack, `OrderList`, `ChoiceGrid` (Match), Repeat Guard |
| Governing ACs | AC-CH-001 … AC-CH-014 |

## 1. Purpose and player experience

Build a mental timeline of world history: events, inventions, buildings, treaties and lives. **Round:** 30–60 s. **Personas:** History Buff, Learner.

## 2. Rules and complete gameplay loop

Three formats:

1. **Order** (default): N cards (Easy 4, Normal 6, Hard 8). Arrange them earliest → latest and Submit once. Reveal shows dates and a mini timeline.
2. **Insert** (endless): one card is placed on a timeline. Each new card must be inserted in the correct gap. A wrong insertion costs a life (3 lives). The card then snaps to its correct position and the run continues. Score = cards placed correctly.
3. **Match** (R3): 5 inventions ↔ 5 inventors (or events ↔ years). Pair them. Same rules as Quiz Library MATCH.

## 3. Modes and configuration

| Option | Values | Default |
|---|---|---|
| Format | Order, Insert, Match | Order |
| Categories | Events, Inventions & discoveries, Buildings & works, Treaties & states, People (birth year) | All |
| Era | Ancient, Medieval, Early modern, Modern, Contemporary, Mixed | Mixed |
| Region | World, a continent | World |
| Difficulty | Easy, Normal, Hard | Normal |
| Unlimited / Daily / Seeded | — | Unlimited |

## 4. Data requirements

### 4.1 Event record

```json
{
  "id": "event:printing-press-gutenberg",
  "label": "Gutenberg's movable-type printing press in use in Mainz",
  "category": "invention",
  "date": {"start": 1450, "end": 1455, "precision": "range", "calendar": "julian"},
  "sort_year": 1450,
  "uncertainty_years": 5,
  "region": "continent:EU",
  "place": "city:gn-2874225",
  "people": ["person:johannes-gutenberg"],
  "status": "published",
  "convention_note": null,
  "sources": [{"title": "Wikidata Q1366", "url": "https://www.wikidata.org/wiki/Q1366", "license": "CC0"}]
}
```

- Dates use **astronomical year numbering** internally (1 BCE = 0, 2 BCE = −1). They are displayed as "753 BCE" / "1450 CE" (or plain "1450").
- `precision` ∈ {day, month, year, decade, century, range, circa}. Implied uncertainty: day/month/year → 0, decade → 5, century → 50, circa → the record's `uncertainty_years` (required), range → (end − start) / 2.
- `status: legendary` (e.g. the traditional founding of Rome) or `contested` → excluded by default. Allowed only with an explicit `convention_note` that is shown on reveal.
- R3 launch bank: ≥ 1,500 events, with ≥ 50% located outside Europe and each of Africa, Asia, the Americas and Oceania ≥ 5% (balance quota: [DATA_AND_CONTENT §8.3](../DATA_AND_CONTENT.md#83-balance-quotas)).

## 5. Answer validation and interaction rules

**Ambiguity is prevented by construction.** For any two cards i and j in a round, the uncertainty intervals `[sort_year − u, sort_year + u]` must be disjoint **and** separated by at least the difficulty gap: Easy 100 years, Normal 20 years, Hard 3 years. Therefore no submitted order can be "arguably correct" while marked wrong. Pairs with any doubt are never generated together.

Interaction uses `OrderList` (see Rank It §5). Insert mode uses gap buttons ("Before 1066", "Between 1066 and 1215", …), which are keyboard-accessible.

## 6. Scoring and difficulty

- **Order:** correct pairs / C(N, 2) × 100. Example: N = 6, 13 of 15 pairs correct → **87**.
- **Insert:** +1 per correct insertion. 3 lives. PB = best run.
- **Match:** as Quiz Library MATCH.
- Difficulty also selects events by `difficulty` (familiarity prior: [DATA_AND_CONTENT §9](../DATA_AND_CONTENT.md#9-difficulty-priors)).

## 7. Hints and feedback

Hint (Order, −15 points, once per round): "Show the century of one card". Reveal: each card shows its date, a ✓/✕ position marker, its `convention_note` if present ("Conventional date. Historians debate…"), and a source link.

## 8. Screens and state transitions

```
Put in order — earliest first                 [Submit]
 ≡ Magna Carta sealed
 ≡ Gutenberg's press in Mainz
 ≡ Fall of Constantinople
 ≡ Battle of Hastings
 ≡ ...
Reveal: vertical timeline with dates, ✓/✕, and "why" notes.
```

States: `arranging` → `revealed` → `next` (Order). Insert: `placing` → (`correct` → `placing` | `wrong` → `placing` or `over`).

## 9. Edge cases

| Case | Expected behavior |
|---|---|
| Julian vs Gregorian dates (e.g. events in Russia before 1918) | `sort_year` is always proleptic Gregorian. Reveal shows "(Julian: …)" when they differ by day. Year-level ordering is unaffected unless the event is within days of a year boundary; such events are flagged `calendar_boundary` and excluded from Hard. |
| BCE / CE boundary | Astronomical numbering ensures correct sorting. There is no year 0 in display. |
| An event with a disputed date (e.g. a battle's year debated) | `contested` → excluded by default |
| The player argues that two events are the same year | Impossible by construction (§5). If it happens due to a data error, the report flow tags `CHRONOLOGY_TIE` with high priority. |
| A person's birth year uncertain ("c. 1340") | `circa` with `uncertainty_years`. Only paired with others outside that window plus the gap. |

## 10. Accessibility and mobile behavior

Same as Rank It: keyboard reordering, move buttons, and announcements. Insert mode's gap list is a radio group.

## 11. Unlimited-play and repeat-prevention behavior

The generator samples N events satisfying the separation rule (retrying up to 200 times, then relaxing era filters with a notice). The Repeat Guard excludes events seen in the last 150 cards. Each card is used at most once per round.

## 12. Acceptance criteria

| ID | Given / When / Then | Example |
|---|---|---|
| AC-CH-001 | Separation by construction | 10,000 generated Normal rounds: every pair satisfies a disjoint-interval and ≥ 20-year gap |
| AC-CH-002 | BCE sorting | 753 BCE (−752) sorts before 44 BCE (−43) |
| AC-CH-003 | Display has no year 0 | Astronomical 0 is displayed as "1 BCE" |
| AC-CH-004 | Scoring | N = 6, 13/15 → 87 |
| AC-CH-005 | Legendary excluded by default | The founding of Rome never appears unless "Include legendary dates" is on |
| AC-CH-006 | Convention note shown | An event with `convention_note` shows it on reveal |
| AC-CH-007 | Insert lives | 3 wrong insertions end the run, with score = correct count |
| AC-CH-008 | Hint cost | Hint + perfect → 85 |
| AC-CH-009 | Circa handling | A c. 1340 ± 10 event is never paired with an event in 1320–1380 on Normal |
| AC-CH-010 | Keyboard reorder | As AC-RK-006 |
| AC-CH-011 | Balance quota validator | The bank fails CI if any non-European continent has < 5% of events |
| AC-CH-012 | Repeat Guard | 150 consecutive cards → no repeats |
| AC-CH-013 | Determinism | The same seed gives the same cards |
| AC-CH-014 | Source on reveal | Every card shows ≥ 1 source |
