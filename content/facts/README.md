# Fact Pin fact bank

Facts for Fact Pin ([fact-pin §4](../../docs/games/fact-pin.md#4-data-requirements)). Curated facts live in one YAML file per category in this folder. The capitals and cities facts are generated from data at build time and are not edited by hand.

## Status

|                      | Count                                                           | Target (R1)                                            |
| -------------------- | --------------------------------------------------------------- | ------------------------------------------------------ |
| Curated, by category | history 27, nature 25, culture 22, science 22, sport 22 (118)   | ≥ 400, at least 50 per category, every continent ≥ 10% |
| Generated capitals   | 197                                                             | 197                                                    |
| Generated cities     | 300 (the largest non-capital populated places in Natural Earth) | 300                                                    |

The curated bank is **below the R1 quota**. Editors need to add about 280 more facts (and a sixth curated category) before the `QUOTA` rule can be turned on with `pnpm content:validate --quotas`. Every fact below was written from well-known public information and cites a source, but it has had **one pair of eyes only**: a second editor should check the facts, coordinates and tolerances before launch.

## Fields

Each file has a `reviewed_at` date and a `facts` list. One fact is one line (or a block) with these keys:

| Key          | Meaning                                                                                                                            |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| `id`         | `fact:NNNN`. Ranges: history 1xxx, nature 2xxx, culture 3xxx, science 4xxx, sport 5xxx. Never reuse an ID.                         |
| `c`          | Category: `history`, `nature`, `culture`, `science`, `sport` (the sixth, `capitals-and-cities`, is generated).                     |
| `e`          | Era: `ancient`, `medieval`, `early-modern`, `modern`, `contemporary`.                                                              |
| `p`          | Precision: `exact` (a spot, 5–10 km), `city`, `region`, `country`, `broad`.                                                        |
| `at`         | `[lat, lon]` of the answer, for a point target.                                                                                    |
| `ent`        | An entity ID such as `country:ISL`, for an area target (instead of `at`).                                                          |
| `tol`        | Tolerance in km around `at`. A pin inside it scores full marks.                                                                    |
| `d`          | Difficulty from 0 (everyone knows it) to 1 (very hard).                                                                            |
| `a`          | The answer label, shown at the reveal. Quote it if it contains a comma.                                                            |
| `in`         | Countries the answer lies in, as `country:XXX`. The first one gives the continent.                                                 |
| `k`          | Continent code (`AF AS EU NA OC SA`) when the country does not say it, for example French Guiana.                                  |
| `t`          | The fact text. 12–35 words, present or past tense. Never name the answer or a place of the same precision. Give at least one clue. |
| `r`          | The reveal: one to three sentences that explain it.                                                                                |
| `s`          | `"Title\|https://url"`. At least one source. Fact text is written by us, so a source is a citation, not a copy.                    |
| `review_due` | Required for anything time-sensitive ("largest", "tallest", "current"): a date at most 12 months away.                             |
| `sensitive`  | `true` for contested places. A senior editor must approve these.                                                                   |

## Template

```yaml
- {
    id: "fact:1099",
    c: history,
    e: modern,
    p: city,
    at: [48.8566, 2.3522],
    tol: 15,
    d: 0.3,
    a: Paris,
    in: [country:FRA],
    t: "A fact of 12 to 35 words that gives a clue but does not name the answer or its country-level neighbours of the same precision.",
    r: "One or two sentences that explain it.",
    s: "Article title|https://en.wikipedia.org/wiki/Article",
  }
```

## Checks

`pnpm content:validate` reads this folder and fails on: a missing source (`FACT_NO_SOURCE`), a text that names its answer or a place of the same precision (`FACT_NAMES_TARGET`), an overdue `review_due` (`FACT_REVIEW_OVERDUE`), a duplicate or malformed ID, a missing continent, and the schema rules in `packages/schemas/src/fact.ts`.
