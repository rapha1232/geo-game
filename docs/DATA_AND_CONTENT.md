# Data and Content

This document covers which datasets Meridian uses, under what terms, how content is modeled and governed, and the editorial rules that keep it accurate. Schemas are in [DATA_MODEL.md](DATA_MODEL.md).

## 1. Principles

1. **Build-time ingestion, no runtime third-party APIs.** All external data is fetched by the content pipeline, normalized, validated, and shipped as versioned static **content packs**. Players' browsers never call Wikidata, the World Bank or any third-party API. This keeps the product fast, offline-capable, reproducible (seeds plus pack versions) and independent of rate limits.
2. **Provenance on every record.** Each record carries `source_ids`. Each source has a license entry. The `/about/sources` page is generated from this registry.
3. **Licenses are verified before ingest.** A source with `verification: pending` in the registry cannot be used by a pack marked `release: true`. The validator enforces this (`LICENSE_UNVERIFIED`).
4. **Editorial overrides live in git**, with a reason for each, so every deviation from source data is reviewable and reversible.

## 2. Source inventory

The list of free APIs and datasets was cross-checked against the [public-apis](https://github.com/public-apis/public-apis) catalog (Geocoding and Open Data sections) as the user requested. Relevant entries were Wikidata, Wikipedia, World Bank, GeoNames, REST Countries, Nominatim and Open Topo Data. Of these, only the bulk datasets behind Wikidata, World Bank and GeoNames are suitable for build-time ingestion. Nominatim's usage policy doesn't fit bulk use, and Meridian doesn't need geocoding.

Verification status: ✅ = terms read from the licensor's own page. 🟡 = from secondary sources. ❓ = not verified. ❌ = rejected. T0.6 verified the R1 sources on 2026-10-30. **The machine-readable source of truth is `data/sources.registry.yaml`** (schema in `packages/schemas`), and the validator enforces `LICENSE_UNVERIFIED` against it.

| ID | Source | Used for | License / terms | Status | Attribution | Update cadence | Redistribution notes |
|---|---|---|---|---|---|---|---|
| `ne` | **Natural Earth** 1:110m, 1:50m, 1:10m (admin-0 countries & map units, admin-1, populated places, physical layers) | All base geometry, admin-1 for R2, physical features for R3 | Public domain ("all versions of Natural Earth raster + vector map data … are in the public domain") | ✅ (terms page quoted in search; also stated on Wikipedia) | Optional. We credit anyway. | Upstream releases are irregular. Re-check quarterly. | Free. NE uses *de facto* boundaries (see §6). Some embedded third-party layers may carry their own grants; we use only admin, populated-places and physical layers. |
| `gb` | **geoBoundaries** (gbOpen) ADM1 | Higher-fidelity subdivisions where NE admin-1 is outdated (R2, per-country decision) | CC BY 4.0 for gbOpen. The license is **per file** (check each boundary's metadata). gbHumanitarian may be less open. | 🟡 | Required: "geoBoundaries (Runfola et al. 2020), CC BY 4.0" | Per country, as needed | Use **gbOpen only**. Store the per-file license in the registry. |
| `wd` | **Wikidata** (SPARQL / dumps) | Names, multilingual labels, aliases, capitals, official languages (P37), elevations, events and dates, external IDs | CC0 for structured data | ✅ (Licensing page read 2026-10-30) | Not required. We credit anyway. | Monthly pipeline refresh, editorially reviewed diffs | Free. Wikipedia **text** is CC BY-SA and MUST NOT be copied into facts. |
| `gn` | **GeoNames** `cities15000`, `alternateNamesV2` | City points, populations, alternate names (R2 cities) | CC BY 4.0 (About page footer) | ✅ (read 2026-10-30) | Required: "GeoNames, CC BY 4.0" | Quarterly | Free with attribution |
| `wb` | **World Bank WDI** (API / bulk CSV) | Population, area, GDP per capita, life expectancy, urbanization, forest % | CC BY 4.0 (default for World Bank produced datasets, per the Data Catalog license page) | ✅ (read 2026-10-30; per-indicator third-party notes still need checking in T2.7) | Required: "World Bank, World Development Indicators, CC BY 4.0" | Annual (July) | Free with attribution. Some indicators are third-party-sourced, so check each indicator's license note. |
| `un` | **UN M49** standard country/area codes | ~~Continents and subregions~~ **Not ingested** | UN Statistics Division publication. The M49 page states **no reuse terms** (verified 2026-10-30) | ❌ rejected | — | — | Unknown terms are not allowed (§2.1). Continents and subregions come from Natural Earth's `CONTINENT` and `SUBREGION` fields (public domain). Registry: `data/sources.registry.yaml`. |
| `fi` | **flag-icons** (lipis/flag-icons) | Flag SVGs (4:3 and 1:1) | MIT | ✅ (repo page) | Keep the MIT notice in `/about/sources` and `THIRD_PARTY_NOTICES` | On upstream release | Free. Flags are national symbols; some jurisdictions restrict *misuse*, not depiction. |
| `hb` | **historical-basemaps** (aourednik) | Lost Borders geometry (R3) | **GPL-3.0** | ✅ (repo page) | Required | On upstream release | Copyleft. See [Q-04](OPEN_QUESTIONS_AND_RISKS.md#q-04-historical-geometry-license). Derived geometry would be distributed under GPL-3.0. |
| `cs` | **CShapes 2.0** | Alternative historical borders, 1886–2019 | Unknown | ❓ | — | — | Evaluate in T3.1. Possibly non-commercial. |
| `wpv` | **Wikimedia pageviews** (per-article monthly) | Familiarity prior (§9) | CC0 ("All Analytics datasets are available under the Creative Commons CC0 dedication") | ✅ (read 2026-10-30) | Credit | Annual | Only aggregates are stored |
| `md` | mledoze/countries | **Validation oracle only** (cross-check names, borders, areas in tests) | ODbL-1.0 (flags excluded) | ✅ (repo page) | — | — | **Not ingested** into packs, to avoid ODbL share-alike obligations on our database. Test-time comparison only. |
| `rc` | REST Countries (public-apis entry) | Not used at runtime. Optional manual cross-check. | MPL-2.0 per its repository | ❓ | — | — | Not ingested |
| `mer` | **Meridian editorial** | Facts, prompts, explanations, overrides, confusables, flag attributes, crossings | Our own content. Publication license decided in Q-06. | — | — | Continuous | — |

### 2.1 Licensing rules

| License class | Allowed in packs? | Conditions |
|---|---|---|
| Public domain, CC0 | ✅ | — |
| CC BY 4.0, MIT, ISC, OFL (fonts) | ✅ | Attribution on `/about/sources` and in `THIRD_PARTY_NOTICES` |
| ODbL | ⚠️ Only in separately packaged, ODbL-licensed packs | Prefer to avoid. Use as a test oracle only. |
| CC BY-SA (e.g. Wikipedia text, many Commons images) | ⚠️ Images only, R4, displayed with per-image credit | Never mix into our fact text |
| GPL-3.0 data | ⚠️ Only in an isolated pack (`history.basemaps`) published under GPL-3.0, with source available | Decision pending (Q-04) |
| Non-commercial (NC) | ❌ | Would block future options and conflicts with the open principle |
| Unknown | ❌ | Until verified |

## 3. Content pipeline

```mermaid
graph LR
  F[fetch: pinned source versions → data/raw/ (gitignored, checksummed)] --> N[normalize: to internal schemas]
  N --> M[merge: join on external IDs → stable Meridian IDs]
  M --> O[apply overrides: content/overrides/*.yaml]
  O --> D[derive: ref points, adjacency, silhouettes, difficulty priors, prompts]
  D --> V[validate: rules §10]
  V --> B[build packs: JSON + TopoJSON, content-hashed]
  B --> R[release: manifest.json with pack versions + license summary]
```

- The pipeline is deterministic: the same raw inputs, overrides and pipeline version produce byte-identical packs (hash-checked in CI).
- `data/sources.lock.yaml` pins each source's version or date and SHA-256.
- **Raw downloads** (`data/raw/`) are gitignored and re-verified against the lock on every build. **Wikidata is a moving target**, so its query result is committed as a point-in-time snapshot (`data/snapshots/wikidata-countries.json`, pinned in the lock like everything else). Refresh it deliberately with `pnpm content:fetch --wikidata --update-lock` and review the diff.
- Rules the real data forced (all fail the build rather than guess): Natural Earth gives dependencies and leases the sovereign's code, so the main feature is the one whose own `ADM0_A3` equals the code. Wikidata uses `XKS` for Kosovo (Meridian: `XKX`). Natural Earth's `PSX` is `PSE`. Where Wikidata has two items for one code, `WD_ITEM_PICKS` names the right one (PSE → Q219060).
- **1:110m omits 29 small states** (Vatican, Monaco, Singapore, Malta…). Those entities use their 1:50m outline in the 110m pack, and the release notes list them.
- Editorial content (`content/`) is hand-edited YAML. Generated packs are build outputs and are **not committed**. CI builds them and they are deployed as static assets.

## 4. Content model overview

| Content type | Key | Stored in | Phase |
|---|---|---|---|
| Geographic entity (country, territory, continent, region, subdivision, city, physical feature) | `type:key` stable ID | `core.*` packs | R1+ |
| Geometry | entity ID → TopoJSON object | `geo.*` packs (110m, 50m, 10m, silhouettes) | R1 |
| Names and aliases | per entity | inside entity records + `core.ambiguity` | R1 |
| Attributes (languages, flag features, etc.) | per entity | `core.attributes` | R2 |
| Adjacency and crossings | edges | `core.adjacency`, `core.crossings` | R1 (adjacency for Silhouette), R2 (crossings) |
| Indicators | (indicator, entity, year) | `indicators` | R2 (R1 includes only population and area for Silhouette hints) |
| Facts | `fact:NNNN` | `facts.v1` | R1 |
| Deep Cut prompts | `prompt:*` | `prompts` | R2 |
| Events | `event:*` | `events` | R3 |
| Polities and historical slices | `polity:*`, `slice:YYYY` | `history.*` | R3 |
| Daily schedules | `date → target` | `daily/*` | R1 |
| Achievements | `ACH-*` | `achievements` | R2 |

## 5. Names, aliases and languages

### 5.1 Alias kinds

| Kind | Meaning | Example | Accepted in answers |
|---|---|---|---|
| `canonical` | Display name (style guide §5.3) | Côte d'Ivoire | ✅ |
| `common` | Widely used English alternative | Ivory Coast, Holland (→ Netherlands), Britain | ✅ |
| `official` | Full official English name | Republic of Côte d'Ivoire | ✅ |
| `ascii` | Diacritic-free form (redundant after normalization, kept for search display) | Cote d'Ivoire | ✅ |
| `former` | Previous name of the same entity | Swaziland, Burma, Zaire (→ DR Congo), Ceylon | ✅, with a "former name" note |
| `endonym` | Native-language name (Latin script or official romanization) | Deutschland, Nippon, Suomi, Hrvatska | ✅ |
| `translation` | Name in an opt-in answer language (es, fr, de, pt, it, nl) | Alemania, Allemagne | ✅ only if that language is enabled (R2) |
| `code` | ISO alpha-2/alpha-3 | FR, FRA | Only in Lenient TYPE_ALL |
| `misspelling` | Known frequent misspelling that fuzzy matching can't reach | — (rarely needed) | ✅ |
| `metonym` | Historical usage (Lost Borders) | Sublime Porte | ✅ in history only |

### 5.2 Alias rules (validated)

1. **Uniqueness within a universe:** an alias key (after `norm()`) may map to more than one entity of the same answer universe **only** if all of those entities are listed in an `ambiguity_group` with a message. Otherwise the build fails (`ALIAS_COLLISION`).
2. **Aliases never name a containing or different entity:** "England" is *not* an alias of the United Kingdom. It is an entity (`subdivision:GB-ENG`) with a `not_in_set_reason`.
3. **Transliterations:** romanization uses the official national system where one exists (Hepburn for Japanese, Pinyin for Chinese, ISO 9 or national systems for Cyrillic). Common English exonyms are always the canonical names.
4. **Historical names** belong to the *same entity* only when continuity holds (Zaire → DR Congo). A different state (USSR, Yugoslavia) is a separate `polity:` entity used only in history games.
5. **Non-Latin script** endonyms (`日本`, `Россия`) are stored with `script` tags but indexed only when the matching answer language is enabled (R2+).

### 5.3 Canonical-name style guide (excerpt; full list in `content/style/canonical-names.yaml`)

| Canonical | Notable aliases |
|---|---|
| Czechia | Czech Republic (`common`) |
| Türkiye | Turkey (`common`) |
| Eswatini | Swaziland (`former`) |
| North Macedonia | Macedonia (`former`), FYROM (`former`) |
| Myanmar | Burma (`former`/`common`) |
| Cape Verde | Cabo Verde (`official`) |
| Timor-Leste | East Timor (`common`) |
| Côte d'Ivoire | Ivory Coast (`common`) |
| DR Congo | Democratic Republic of the Congo (`official`), Congo-Kinshasa (`common`), Zaire (`former`) |
| Republic of the Congo | Congo-Brazzaville (`common`). "Congo" is ambiguous. |
| United States | USA, US, United States of America, America (`common`) |
| United Kingdom | UK, Great Britain, Britain (`common`) |
| Vatican City | Holy See, Vatican (`common`) |
| Palestine | State of Palestine (`official`), Palestinian territories (`common`) |
| Taiwan | Republic of China (`official`), Chinese Taipei (`common`) |
| Micronesia | Federated States of Micronesia (`official`), FSM (`common`) |

## 6. What counts as a country

### 6.1 Country sets

| Set ID | Members | Count | Default for |
|---|---|---|---|
| `un-193` | UN member states | 193 | Optional |
| `sovereign-197` | `un-193` + Vatican City and Palestine (UN observer states) + Kosovo + Taiwan | 197 | **All games** |
| `territories` | Entities with their own ISO 3166-1 alpha-2 code that are not in `sovereign-197` and are not integral parts of a state (e.g. Greenland, Faroe Islands, Puerto Rico, Guam, Bermuda, Gibraltar, Falkland Islands, French Polynesia, New Caledonia, Hong Kong, Macau, Aruba, Curaçao, Western Sahara). Final list: `content/sets/territories.yaml`. | ~45–55 | Optional add-on |
| `limited-recognition-extra` | Northern Cyprus, Abkhazia, South Ossetia, Transnistria, Somaliland | 5 | Never in quizzes (R1). Shown in Atlas with notes (R2). |

Rationale: 197 is the count many quiz players expect. It includes both UN observer states and the two entities with the most recognition outside the UN. Every game shows a "What counts as a country here? ⓘ" note with this table, and a player can switch to `un-193`.

### 6.2 Integral parts vs territories

- **Integral parts** (French Guiana, Réunion, Guadeloupe, Martinique, Mayotte, the Canary Islands, the Azores, Madeira, Hawaii, Alaska, Svalbard) belong to their country. They are not separate answers. Typing one gives the message "French Guiana is an overseas region of France (part of France)."
- **Territories** (§6.1) are separate entities with their own geometry, guessable in Silhouette, and answerable when `territories` is enabled.
- **Constituent countries** (England, Scotland, Wales, Northern Ireland) are `subdivision:` entities with a `not_in_set_reason`.

### 6.3 Disputed areas

- Base geometry follows Natural Earth's **de facto** boundaries.
- Areas flagged in `content/disputes.yaml` (initially Kashmir and Aksai Chin, Western Sahara, Crimea, Abkhazia, South Ossetia, Golan Heights, Northern Cyprus, Transnistria, Kuril Islands, Falklands/Malvinas, Arunachal Pradesh, Essequibo, Hala'ib Triangle, Bir Tawil, Kosovo, Taiwan, Palestine/West Bank and Gaza, the South China Sea features) carry `claimants[]` and a neutral note.
- Rendering: the disputed overlay uses the `cross-hatch` pattern plus a note on hover ("Disputed: administered by X; claimed by Y").
- **Scoring fairness rules:**
  - Fact Pin area targets: a pin inside a disputed area counts as inside the target if the target is **any claimant**.
  - MAP_CLICK: clicking a disputed overlay selects nothing, consumes no attempt, and shows the dispute note.
  - Adjacency: edges that exist only through a disputed area are flagged `disputed: true`. They count for Border Run and the Silhouette border marker, with the dispute note shown on reveal.

## 7. Contested and time-dependent facts

### 7.1 Capitals policy

- Accept the capital(s) **designated by the country's own law** (role `official`/`constitutional`) plus the **seat of government** (`seat_of_government`).
- Where the designation is internationally contested, show a note but still follow the country's designation. Jerusalem (Israel): accepted, with the note "Most countries maintain embassies in Tel Aviv"; Tel Aviv is not accepted. Palestine: East Jerusalem (designated) and Ramallah (administrative seat) are both accepted.
- Changes (e.g. Indonesia's move to Nusantara) are applied when **legally effective**. Until then, the planned capital is mentioned in the entity card only. Each capital record has `valid_from`.

### 7.2 Date-dependent values

- Indicators always carry `year`. The UI always shows the year.
- Facts with time-sensitive claims carry `as_of` and `review_due` (≤ 12 months). Overdue facts are excluded from generation 30 days after `review_due` (validator warning → error).
- Historical facts use date precision and uncertainty (see [chronology §4](games/chronology.md#4-data-requirements)). Legendary or contested dates are excluded by default.
- Entity validity: `valid_from`/`valid_to` on entities (e.g. South Sudan `valid_from: 2011-07-09`). Modern games use the entities valid on the content release date.

## 8. Editorial workflow and corrections

### 8.1 Roles

| Role | Can |
|---|---|
| Editor | Triage reports, edit `content/` via PR, set fact status |
| Senior editor | Approve PRs touching `disputes.yaml`, `sets/`, capitals policy, or anything tagged `sensitive` |
| Maintainer | Release content versions, manage source pins |

In R1–R2, editors work in git (YAML + PRs), and reports are read from the admin API/DB. In R3, the `/admin` console provides a report queue, a fact editor with validation, and one-click "create PR" (the console writes branches through the GitHub API, so git remains the source of truth).

### 8.2 Report triage

| Severity | Examples | Target fix time |
|---|---|---|
| S1 | A correct answer rejected or a wrong answer accepted in a popular quiz; offensive content | 48 h (hotfix content release) |
| S2 | A factual error in a fact or indicator; a wrong map feature | 7 days |
| S3 | Spelling, style, missing alias with low impact | 30 days |

Flow: report → auto-dedupe (same target + category) → triage (severity, accept/decline with a reason) → PR → validator passes → content release → changelog entry → reporter notified if they left an email or account.

### 8.3 Balance quotas

| Content | Rule (validator `QUOTA`) |
|---|---|
| Fact Pin facts | Each of Africa, Asia, Europe, North America, South America and Oceania ≥ 10%. Each category ≥ 50 facts. |
| Chronology events | ≥ 50% located outside Europe. Each of Africa, Asia, Americas and Oceania ≥ 5%. |
| Deep Cut prompts | No family > 25% of the prompt pool |

### 8.4 Release versioning

Content versions are `YYYY.MM.N` (e.g. `2026.11.0`). Each release has a manifest with pack hashes, source pins and release notes. Old pack versions stay deployed for **180 days** so that challenge links and resumed sessions keep working (see [ARCHITECTURE §8.4](ARCHITECTURE.md#84-challenge-codes)).

## 9. Difficulty priors

Computed in the pipeline (`derive` step), per entity, in [0, 1] where higher = harder:

| Signal | Definition |
|---|---|
| `fam` (familiarity) | Percentile rank of `0.7 × log10(12-month English Wikipedia pageviews) + 0.3 × log10(population)` among all entities of the type |
| `areaN` | Percentile rank of log10(area) |
| `recall` | `1 − fam` |
| `locate` | `1 − (0.6 × fam + 0.4 × areaN)` |
| `flag` | `1 − fam`, + 0.15 if the entity has a `confusables` entry (capped at 1) |
| `capital` | `1 − (0.5 × fam + 0.5 × capFam)` (`capFam` = familiarity of the capital city), + 0.1 if the capital isn't the largest city |
| `shape` | `1 − (0.5 × fam + 0.3 × areaN + 0.2 × compactnessDistinctiveness)`, where the latter is an editorial 0–1 score defaulting to 0.5 |

**Calibration (R2+):** with aggregate first-attempt accuracy `acc` over `n` anonymous attempts, `posterior = (prior × k + (1 − acc) × n) / (k + n)` with `k = 50`. Recomputed nightly and shipped in the next content patch release.

## 10. Validation rules (content CI)

| Code | Rule | Level |
|---|---|---|
| `ID_FORMAT` | IDs match `^[a-z]+:[A-Za-z0-9._-]+$` | error |
| `ID_REUSED` | An ID removed in a past release is never reassigned (checked against `content/retired-ids.txt`) | error |
| `NAME_MISSING` | Every entity has a canonical name | error |
| `ALIAS_COLLISION` | §5.2 rule 1 | error |
| `GEOM_INVALID` | Valid, non-self-intersecting polygons with the correct winding. No empty geometries. | error |
| `GEOM_MISSING` | Every entity in a playable set has geometry in 110m, 50m and 10m (for entities Natural Earth omits at 110m, the 110m pack uses the 50m outline) | error |
| `REF_POINT_OUTSIDE` | `ref_point` inside its polygon | error |
| `ADJ_ASYMMETRIC` | Adjacency is symmetric | error |
| `CAPITAL_OUTSIDE` | Capital point inside its country's 10m polygon (tolerance 2 km) | error |
| `SET_COUNT` | `sovereign-197` has exactly 197 members and `un-193` exactly 193 | error |
| `FACT_NAMES_TARGET` | Fact text contains no alias of the target (or of an entity at the same or coarser precision) | error |
| `FACT_NO_SOURCE` | ≥ 1 source with a license | error |
| `FACT_REVIEW_OVERDUE` | `review_due` passed (warning), or passed by more than 30 days (error, excluded) | warn/error |
| `LICENSE_UNVERIFIED` | Every source used in a release pack has `verification: done` | error |
| `INDICATOR_COVERAGE` | ≥ 90% of sovereign-197 have a value for each shipped indicator | error |
| `DAILY_REPEAT` | Daily schedules respect each game's window | error |
| `PROMPT_ANSWER_BOUNDS` | Deep Cut prompts have 4–30 answers | error |
| `EVENT_DATE_INVALID` | Events have valid astronomical years and a precision | error |
| `QUOTA` | §8.3 | error |
| `DETERMINISM` | Rebuilding the packs yields identical hashes | error |

## 11. Update cadence

| Content | Cadence |
|---|---|
| Editorial fixes (S1) | Hotfix release within 48 h |
| Editorial batch | Weekly patch release |
| Indicators (World Bank) | Annual refresh each August |
| Source re-pin (NE, Wikidata, GeoNames) | Quarterly, with a reviewed diff (names, capitals and sets diffs require a senior editor) |
| Difficulty calibration | Nightly computation, shipped with the next patch |
| Daily schedules | Extended monthly to keep ≥ 365 days ahead |
