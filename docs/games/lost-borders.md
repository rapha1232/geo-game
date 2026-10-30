# Lost Borders

| Field | Value |
|---|---|
| Game ID | G-LB |
| Slug / route | `/play/lost-borders` |
| Phase | **R3**. **Gated by open question [Q-04](../OPEN_QUESTIONS_AND_RISKS.md#q-04-historical-geometry-license)** (license of the historical geometry). |
| Inspiration | Original (Proposed) |
| Depends on | `history.basemaps` pack (time-sliced polity geometry), `history.polities` (names and aliases with validity periods), Name Matcher, `GameMap`, `ChoiceGrid`, Repeat Guard |
| Governing ACs | AC-LB-001 … AC-LB-013 |

## 1. Purpose and player experience

See how the political map changed: "What empire is highlighted on this map of 1700?" **Round:** 20–40 s. **Personas:** History Buff, Learner.

## 2. Rules and complete gameplay loop

Formats:

1. **Identify** (default): a basemap of year Y with one polity highlighted. Type its name (Name Matcher over polity aliases valid at Y) or choose from 4 options (Easy). 3 attempts for typed answers.
2. **Find:** "Click the Ottoman Empire on this map of 1600." Same rules as MAP_CLICK.
3. **Which year?:** a full basemap is shown. Pick the year slice from 4 options that are ≥ 100 years apart (Normal).
4. **Then and now** (R3+): "Select the modern countries that overlap the Mughal Empire in 1700" (TILE_SELECT). Overlap ≥ 10% of the modern country's area counts.

## 3. Modes and configuration

| Option | Values | Default |
|---|---|---|
| Format | Identify, Find, Which year?, Then and now | Identify |
| Era | Ancient, Medieval, Early modern, Modern | Mixed |
| Region | World, a continent | World |
| Answer style | Typed, Multiple choice | Typed (Normal), MC (Easy) |
| Unlimited / Daily / Seeded | — | Unlimited |

## 4. Data requirements

- **Candidate geometry:** `aourednik/historical-basemaps` (GeoJSON time slices; properties `NAME`, `SUBJECTO`, `PARTOF`, `BORDERPRECISION` 1–3). Verified license: **GPL-3.0**. See Q-04 for the implications. Alternative for 1886–2019: CShapes 2.0 (license not verified in this research; must be checked).
- `history.polities`: a curated record per polity with a stable ID, canonical name, aliases (each with `valid_from`/`valid_to`), predecessor/successor links, and a mapping from source `NAME` strings in each slice → polity ID.

```json
{
  "id": "polity:ottoman-empire",
  "canonical": "Ottoman Empire",
  "aliases": [
    {"text": "Ottoman Empire", "valid_from": 1299, "valid_to": 1922},
    {"text": "Ottomans", "valid_from": 1299, "valid_to": 1922},
    {"text": "Sublime Porte", "valid_from": 1600, "valid_to": 1922, "kind": "metonym"}
  ],
  "related_hints": [{"text": "Turkey", "message": "Close: modern Turkey is its successor state, but in {year} this was the Ottoman Empire."}],
  "source_names": {"1600": "Ottoman Empire", "1700": "Ottoman Empire"}
}
```

- Eligibility: only polities with `BORDERPRECISION ≥ 2` in the slice **or** an area ≥ 500,000 km² are used as Identify or Find targets (fuzzy borders are fine for big empires, not for small principalities).

## 5. Answer validation and interaction rules

- **Accepted:** any alias whose validity period contains Y ± 25 years.
- **Related hint (no credit, no attempt consumed):** if the input matches a `related_hints` entry (e.g. "Turkey" for the Ottoman Empire, "Germany" for the Holy Roman Empire in 1700, "Iran" for Safavid Persia), show the message, which teaches the difference. This is the platform's rule for **ambiguous historical answers**: a modern successor name is *not wrong in spirit* but not the answer, so it gets a teaching message and no penalty.
- **Anachronism:** an alias of the right polity but outside its validity window (e.g. "Byzantine Empire" for Y = 1500, after 1453) is treated as a wrong attempt with the message "In 1500, the Byzantine Empire no longer existed."
- Uncertainty is shown: polities with `BORDERPRECISION = 1` are drawn with a blurred edge and the label "approximate borders".

## 6. Scoring and difficulty

Identify (typed): 1 / 0.5 / 0.25 for the 1st / 2nd / 3rd attempt, ×100 per round. MC: 100 or 0. Find: as MAP_CLICK. Which year?: 100 or 0. Then and now: as TILE_SELECT. Difficulty sets the polity size (Easy ≥ 1,000,000 km²), the era mix, and the answer style.

## 7. Hints and feedback

The hint ladder (each halves the maximum) is: era/century of the slice (always visible) → region name → first letter. Reveal shows the polity's span (e.g. 1299–1922), capital at Y, predecessor and successor, and the data-precision note.

## 8. Screens and state transitions

```
┌─────────────────────────────────────────────┐
│ Lost Borders · Map of 1700   Round 3        │
│ MAP (historical, highlighted polity)         │
│ "approximate borders" badge if precision=1   │
│ [ Name this state… ]           [Hint ▾]     │
└─────────────────────────────────────────────┘
```

States as in Quiz Library TYPE_PROMPTED (`prompting` → `answered`/`revealed` → `next`).

## 9. Edge cases

| Case | Expected behavior |
|---|---|
| Polity name differs between source slices ("Mughal Empire" / "Mughal") | `source_names` mapping unifies them under one polity ID |
| Typed modern name | `related_hints` message, no penalty |
| Overlapping claims in the source (e.g. tributary relationships via `SUBJECTO`) | The target highlight uses the polity's own polygon. "Then and now" uses its own polygon only. |
| A source slice with clearly wrong data reported | Report flow → editorial override (`content/overrides/history/*.yaml`) that renames or hides the polity in that slice |

## 10. Accessibility and mobile behavior

Identify and Which year? are playable without the map through a **text description** ("A large empire spanning south-eastern Europe, Anatolia, the Levant and North Africa"), labeled "assisted". Find offers the same accessible variant as MAP_CLICK.

## 11. Unlimited-play and repeat-prevention behavior

Each (slice, polity) pair is a candidate round (an estimated 2,000+ across slices). The Repeat Guard excludes the last 200 pairs and the same polity within 10 rounds.

## 12. Acceptance criteria

| ID | Given / When / Then | Example |
|---|---|---|
| AC-LB-001 | Alias validity window | Y = 1600, "Ottoman Empire" accepted |
| AC-LB-002 | Related hint is not penalized | Y = 1700 Ottoman target, "Turkey" → teaching message, attempts unchanged |
| AC-LB-003 | Anachronism | Y = 1500, a Byzantine-alias input against an Ottoman target → wrong, with the message "no longer existed" |
| AC-LB-004 | ±25-year tolerance | An alias valid from 1720 is accepted at Y = 1700 |
| AC-LB-005 | Eligibility | No target with `BORDERPRECISION = 1` and area < 500,000 km² |
| AC-LB-006 | Approximate badge | A precision-1 target shows "approximate borders" |
| AC-LB-007 | Which year? options ≥ 100 years apart | Normal |
| AC-LB-008 | Then and now overlap rule | A modern country with ≥ 10% overlap counts as correct |
| AC-LB-009 | Attribution | The basemap credit and license appear on every Lost Borders screen |
| AC-LB-010 | Determinism | Same seed → same (slice, polity) |
| AC-LB-011 | Repeat Guard | 200 rounds → no repeated pair |
| AC-LB-012 | Assisted text variant | Text description shown when enabled |
| AC-LB-013 | Release gate | The build fails if the `history.basemaps` pack lacks a `license_cleared: true` manifest flag |
