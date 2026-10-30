# Reference Research

Research was conducted on **2026-10-30** from a cloud environment with automated HTTP fetches and web search. It did **not** include interactive play in a browser. Every claim below is labeled:

| Label | Meaning |
|---|---|
| ✅ **Verified** | Read directly on the product's own pages during this research session (quoted where possible) |
| 🟡 **Secondary** | From a third-party source (Wikipedia, game directories, reviews). Plausible but not confirmed on the product itself. |
| ❓ **Uncertain** | Not confirmed. Recorded as an open item. MUST NOT be treated as fact when implementing. |

> **Access limitations (recorded explicitly):**
> - **JetPunk** (`jetpunk.com`) returned **HTTP 403 Forbidden** to every automated request (home page and quiz pages). JetPunk findings rely on the JetPunk Wikipedia article and JetPunk pages surfaced through search results.
> - **Fact Map** (`factmap.world`) returned **HTTP 429 Too Many Requests** on every attempt. Findings rely on the site's search-indexed title and description and two game-directory pages.
> - **Farflung** and **Worldle** were readable, but their game boards are JavaScript-rendered, so the map, board and animations were not observed. Rules, FAQ and How-to-play text was read directly.
>
> Before implementation, a human SHOULD spend 30 minutes playing each reference to resolve the ❓ items in §7. None of them block the blueprint, because Meridian's mechanics are fully specified independently.

## 1. JetPunk

**What it is:** a large quiz website, founded in 2008, with official and user-created quizzes on many topics. Geography is its best-known area. 🟡 ([Wikipedia: JetPunk](https://en.wikipedia.org/wiki/JetPunk))

### Core loop and modes

| Aspect | Finding | Status |
|---|---|---|
| Quiz types | Text (type answers into a grid), Picture, Click (pick options matching a hint), Click map (regions highlighted in sequence; you pick the matching option), Multiple choice, Tile select, Sudden death (one wrong tile ends the quiz), Whammies (N wrong answers end the quiz), Point clicker (most points within N clicks, tiles ranked by a statistic) | 🟡 Wikipedia. The create menu listing Click, Map, Multiple Choice, Picture, Sudden Death, Text and Tile Select is corroborated by search snippets of jetpunk.com |
| Loop | Press **Start Quiz**, a countdown timer starts, type or click answers, use **Give Up?** to end early, then see the results with the missed answers | 🟡 Quiz pages in search snippets show "Start Quiz 3:00 Give Up?" |
| Typed answers | Typed answers are accepted as you type, without pressing Enter, and fill the answer grid or map | 🟡 Widely described. Not directly observed. |
| Timed vs untimed | Users reportedly can take quizzes timed or untimed | 🟡 Low-quality source |
| Map quizzes | Interactive maps fill in as countries are named | 🟡 Third-party description |
| Countries of the World | Played about 47 million times. Exists in 60+ languages. | 🟡 Wikipedia |
| Time limit for Countries of the World | Commonly cited as 15 minutes | ❓ Not confirmed |
| Accepted alternate names | Quizzes accept alternate names. The exact list isn't public. | ❓ |

### Scoring, progression and social

| Aspect | Finding | Status |
|---|---|---|
| Points and levels | Featured, timed quizzes award up to 5 points, based on score or percentile. Points raise a user level. | 🟡 |
| Badges | 44 badges for reaching certain scores on specific quizzes | 🟡 |
| Daily features | Daily streak, Daily Trivia Challenge (since May 2024), Minesweeper (Feb 2025), word search with daily puzzles (Feb 2026) | 🟡 |
| Accounts | Free registration. An account is required to create quizzes and earn badges. Premium adds analytics and removes ads. | 🟡 |
| Languages | Sections in 9 languages | 🟡 |
| UGC scale | About 613,000 quizzes, including 20,000+ geography quizzes | 🟡 |

### Worth adapting

- The **type-anything-in-any-order** "name them all" loop, with instant acceptance and no Enter key.
- **Format variety** over the same data: the same country set can be a typing quiz, a click map, a tile select or a sudden-death round.
- **Give up and review**, with missed answers revealed in place.
- **Statistic-ranked tiles** (Point clicker). This informs Rank It and Deep Cut.

### Limitations Meridian should improve on

- Static authored quizzes, so replaying gives the identical quiz. Meridian generates quizzes from templates, scopes and seeds.
- Quality varies across 600k user quizzes. Meridian uses curated templates over one validated dataset.
- The teaching loop is thin (you see what you missed, not why). Meridian adds a result review with facts and a map.
- Accepted-answer rules are not transparent. Meridian publishes its rules and shows *why* an answer was rejected (ambiguous, wrong scope, or not in this quiz).

### Support for unlimited play

The underlying mechanics (typing grid, click map, tile select) are content-agnostic. With a structured dataset, any subset or scope produces a new quiz. Meridian adds **random-N subsets**, **review-your-misses** and **seeded variants**.

## 2. Fact Map (factmap.world)

| Aspect | Finding | Status |
|---|---|---|
| Identity | Search-indexed title: "FactMap · Where in the world?" Described as a daily game of general knowledge and geography: "Read a fact, drop a pin on the map, and see how close you get." Free, no account needed. | 🟡 Search index of factmap.world |
| Rounds | Five new questions daily, at midnight Paris time | 🟡 Search index |
| Fact content | Facts cover history, culture, nature and current events | 🟡 [playlin.io](https://playlin.io/game/fact-map/) |
| Input | Drop a pin on a world map at the location the fact refers to | 🟡 Multiple sources |
| Precision target | "A target indicator above the map shows how precise your pin needs to be. Some facts need only the right country or region, while others require the exact city or landmark." | 🟡 playlin.io |
| Scoring | Up to 1,000 points per fact, based on distance. A bullseye earns full marks, and the score falls as the pin moves farther away. Exact formula not published. | 🟡 |
| Unlimited | One directory says "Daily and unlimited play" without detail | ❓ [wordle.today](https://wordle.today/games/factmap). Unconfirmed. |
| Exploration map / fact browsing | **No evidence** that Fact Map is a free-exploration "interactive fact map". It appears to be a pin-the-fact guessing game. | ❓ |

> **Important finding:** the brief describes Fact Map as an "interactive fact map". The evidence available suggests it is a **daily pin-the-location trivia game**. Meridian therefore specifies **both**:
> - **Fact Pin** ([games/fact-pin.md](games/fact-pin.md)): the pin-the-fact game, inspired by the observed mechanic. **R1**.
> - **Atlas Explorer** ([games/atlas-explorer.md](games/atlas-explorer.md)): the free-exploration interactive fact map the brief envisioned. It shares the same fact bank and turns exploration into challenges. **R2**.

**Worth adapting:** per-fact **precision classes** (country-level vs city-level), distance-decay scoring out of 1,000, and fact-first prompts that teach while testing.
**Limitations to improve:** five per day only, an unpublished scoring formula, and no explanation layer. Meridian publishes its formula, offers unlimited play from a large fact bank, and shows the source on every fact.

## 3. Farflung (farflung.game)

All findings below are ✅ **Verified** from [farflung.game](https://farflung.game/), [/how-to-play](https://farflung.game/how-to-play) and [/about](https://farflung.game/about).

| Aspect | Finding |
|---|---|
| Structure | A daily "expedition" of **five prompts**, the same for everyone. Opens at midnight local time. |
| Prompts | Each prompt has **several correct countries**. Example: "countries where German is official". Germany counts, but "Belgium carries you much further". |
| Input | Tap the map to place a pin ("Tap again to move it"), then press **Drop pin**. One answer per prompt. The same country may be used for several prompts if it fits each one. |
| Timer | **60 seconds** per prompt by default. A 30-second clock is available under Difficulty. When time runs out, a pin you placed is dropped automatically. |
| Rarity | Answers are rated **Common, Uncommon, Rare, Elusive, Farflung**, "based on how seldom they come to mind". Each prompt has at least one Farflung answer ("gem"). |
| Scoring | A correct answer adds **distance in kilometres**. Rarer answers add more. A wrong or empty answer adds nothing. No numeric point table is published. |
| End of game | "Camp" shows total distance, every answer and facts about the countries, plus sharing. |
| Disputes | "Should something else count?" opens a form (sign-in required) to propose an answer, with a public **Rulings** page. Upheld answers count retroactively. Replies within a week. |
| Modes | Daily Expedition. "Past week" replays the last 7 days. An untimed practice round. **"No unlimited mode yet."** |
| How rarity is computed | **Not published** ❓. "Based on how seldom they come to mind" suggests player pick frequency, but this is unconfirmed. |

**Worth adapting:** the multi-answer prompt where the goal is to find a correct but **less obvious** answer, rarity tiers, a public rulings process for disputed answers, and the end-of-run reveal of all valid answers.
**Limitations to improve:** no unlimited play, an opaque rarity calculation, and a single pin per prompt. Meridian's **Deep Cut** ([games/deep-cut.md](games/deep-cut.md)) generates prompts from structured attributes for unlimited play and documents how rarity is computed, starting from a published prior and calibrating with aggregate play.

## 4. Worldle (worldle.teuteuf.fr)

All findings ✅ **Verified** from the [game page](https://worldle.teuteuf.fr/), [/rules](https://worldle.teuteuf.fr/rules) and [/faq](https://worldle.teuteuf.fr/faq), except where marked.

| Aspect | Finding |
|---|---|
| Goal | "Guess the country from its shape." **6 guesses.** |
| Valid guesses | "Each guess must be a valid country or territory." Uses **ISO 3166-1**, so Scotland and Hong Kong "won't be accepted". Puerto Rico is also listed as not accepted, which looks inconsistent because Puerto Rico has ISO 3166-1 code PR ❓. |
| Feedback | Distance (km or miles), a direction arrow (**8 compass directions**, "closest arrow possible", never routed across the poles), and proximity %. |
| Distance | "Computed between the **centers** of the selected country and the target territory." The method of finding the center is not specified ❓. |
| Proximity | 100% if correct, 0% at the antipode. Squares: 5 tiles, 🟩 = 20% and 🟨 = 10%, rounded down to the nearest 10. Assumed linear between those points ❓. |
| Rotation rules | Countries under 5,000 km² don't repeat within 7 days. No country repeats within 100 days. Consecutive days avoid the same continent (Africa and Asia only). |
| Bonus rounds | Unlocked after the main round: Neighbors, Capital, Flag, plus other trivia rounds |
| Modes | Free daily puzzle (resets at local midnight). Archive is **Premium-only**. Practice mode (/practice) with XP and unlockable subjects (maps, flags, languages). |
| Share | A spoiler-free emoji grid |

**Worth adapting:** silhouette deduction, distance plus 8-way direction plus proximity feedback, rotation rules (adapted into the Repeat Guard), and post-solve bonus rounds that turn a single target into a learning sequence.
**Limitations to improve:** center-to-center distance is ambiguous and misleading for large or multipart countries, the archive is paywalled, daily-only play is primary, and territory handling is opaque. Meridian's **Silhouette** ([games/silhouette.md](games/silhouette.md)) defines exactly which point is used (§5.3), adds an adjacency signal, explains territory rules in the UI, and is unlimited by default.

## 5. Other relevant products

| Product | Mechanic | Status | Takeaway for Meridian |
|---|---|---|---|
| **Travle** ([travle.earth](https://travle.earth/)) | Connect a start country to an end country by guessing intermediate countries. Three hints: outline of the next country, outlines of all countries, and initials. Daily, weekly challenge and practice. | ✅ Partly. Color feedback and limits were not visible. | Basis for **Border Run**, which uses our own adjacency graph and scoring |
| **Globle** | Guess the mystery country; guesses are colored by proximity on a globe | ❓ Page content not retrievable (title only) | Proximity-heat feedback is an optional Silhouette assist (R2) |
| **Seterra** | Map quiz modes: Pin (click the named place), Type (type the name of the highlighted place), Place the labels (drag names to pins), Learn mode, and review of missed items | 🟡 Teacher blogs | Confirms value of **Learn** and **Review misses** modes in Quiz Library |
| **Sporcle** | Typed-list quizzes similar to JetPunk | 🟡 (compared to JetPunk on Wikipedia) | Same as JetPunk |
| **Chronophoto / Timdle** | Date or ordering guessing from photos and events | 🟡 Listed as similar games on wordle.today | Basis for **Chronology** (events, no photos) |

## 6. Feature coverage matrix

Legend: **R1–R4** = Meridian phase. "—" = not planned. *Behavior* references the governing spec.

### 6.1 JetPunk-derived quiz features

| JetPunk feature | Meridian support | Phase | Meridian behavior |
|---|---|---|---|
| Text / "name them all" typing quiz | ✅ `TYPE_ALL` format | R1 | Instant acceptance on exact alias match. Fuzzy matching on Enter. [quiz-library §5](games/quiz-library.md#5-answer-validation-and-interaction-rules) |
| Picture quiz (type what is shown) | ✅ `TYPE_PROMPTED` (flag, silhouette, highlighted region) | R1 | One prompt at a time. Skip and return supported. |
| Click quiz (click options matching a hint) | ✅ `MATCH` format | R2 | Prompt list on one side, tile grid on the other |
| Click map | ✅ `MAP_CLICK` | R1 | Named entity shown. Click it on the map. Tiny-target expansion. |
| Multiple choice | ✅ `MULTIPLE_CHOICE` | R1 | 4 options with distractors chosen by difficulty |
| Tile select | ✅ `TILE_SELECT` | R2 | Select all tiles matching a criterion |
| Sudden death | ✅ `lives = 1` modifier on any format | R2 | First wrong answer ends the run |
| Whammies | ✅ `lives = N` modifier | R2 | N wrong answers end the run |
| Point clicker (stat-ranked tiles) | ✅ Folded into **Rank It** "top picks" variant | R2 | [rank-it.md](games/rank-it.md) |
| Timed and untimed | ✅ | R1 | [quiz-library §3](games/quiz-library.md#3-modes-and-configuration) |
| Give up and see missed answers | ✅ | R1 | Missed answers revealed with a hatched fill and a ✕ icon |
| Featured points, levels, badges | ✅ Replaced by **mastery** and **achievements** | R2 | No public levels. Achievements are personal. |
| Daily streak | ✅ Optional, with freeze days | R2 | [UX_AND_DESIGN §7](UX_AND_DESIGN.md#7-progress-statistics-achievements-and-streaks) |
| Multi-language quizzes | ✅ Answer languages | R2 (answers), R4 (UI) | [DATA_AND_CONTENT §5](DATA_AND_CONTENT.md#5-names-aliases-and-languages) |
| User-created quizzes | — | — | Excluded ([PRODUCT_VISION §6](PRODUCT_VISION.md#explicit-exclusions)) |
| Blogs, comments, likes | — | — | Excluded |
| Premium / ads | — | — | Excluded |

### 6.2 Quiz category coverage

| Category | Example quizzes | Formats | Phase |
|---|---|---|---|
| Countries and territories | Countries of the World; Countries of Africa; 20 random countries | TYPE_ALL, MAP_CLICK, TYPE_PROMPTED, MC | **R1** |
| Capitals | Capitals of Europe; Country from capital | TYPE_PROMPTED, MC, TYPE_ALL (by map), MATCH | **R1** (MATCH R2) |
| Flags | Flags of the World; Flags of Asia | TYPE_PROMPTED, MC, MAP_CLICK (click the flag's country) | **R1** |
| Regions and continents | Continents; UN subregions | MAP_CLICK, MC | **R1** |
| States, provinces, subdivisions | US states, Canadian provinces, Australian states, Indian states, Brazilian states, German Länder, Chinese provinces, Mexican states, Japanese prefectures, French regions, Spanish autonomous communities, Italian regions (12 countries) | TYPE_ALL, MAP_CLICK, TYPE_PROMPTED, MC | R2 |
| Subdivision capitals | US state capitals, etc. | TYPE_PROMPTED, MC | R2 |
| Cities | Largest cities of the world; cities of Europe on a map | MAP_CLICK (point), TYPE_ALL, MC | R2 |
| Population, area and rankings | Most populous countries; largest by area | TYPE_ALL ranked list, Rank It | R2 |
| Rivers | Longest rivers; rivers of Europe | MAP_CLICK (line), TYPE_PROMPTED | R3 |
| Mountains and ranges | Highest peaks; mountain ranges | MAP_CLICK (point/area), TYPE_PROMPTED | R3 |
| Lakes, seas, oceans, straits, bays, gulfs | Seas of the world; straits | MAP_CLICK, TYPE_PROMPTED | R3 |
| Islands and archipelagos | Largest islands | MAP_CLICK, TYPE_PROMPTED | R3 |
| Deserts and other features | Deserts; peninsulas | MAP_CLICK, TYPE_PROMPTED | R3 |
| Landmarks | UNESCO sites; famous buildings | MAP_CLICK (point), MC | R4 (image licensing) |
| Historical countries and empires | Countries that no longer exist; empires at their peak | TYPE_PROMPTED, MAP_CLICK on a historical basemap | R3 |
| Historical events | Events by year | Chronology | R3 |

### 6.3 Other references

| Reference mechanic | Meridian game | Phase | Observed or Proposed |
|---|---|---|---|
| Fact → pin, distance-scored out of 1,000 | Fact Pin | R1 | Observed (secondary sources). Formula is Proposed. |
| Precision target per fact | Fact Pin `precision` classes | R1 | Observed (secondary) |
| Interactive exploration fact map | Atlas Explorer | R2 | **Proposed** (not confirmed on Fact Map) |
| Multi-answer prompt with rarity tiers | Deep Cut | R2 | Observed |
| 60s / 30s timer per prompt | Deep Cut | R2 | Observed |
| Rulings page for disputed answers | Platform corrections + public changelog | R1 (reports), R3 (public rulings page) | Observed (Farflung) → adapted |
| Shape + distance + 8-way direction + proximity % | Silhouette | R1 | Observed |
| Rotation rules (small countries, 100-day window) | Repeat Guard | R1 | Observed → generalized |
| Bonus rounds (neighbors, capital, flag) | Silhouette "Follow-up" rounds | R1 (capital, flag), R2 (neighbors) | Observed |
| Path between countries | Border Run | R2 | Observed (Travle) |

## 7. Open research items

| ID | Question | Why it matters | How to resolve |
|---|---|---|---|
| RR-1 | JetPunk's exact acceptance behavior (fuzzy? diacritics?) | Benchmark only. Meridian's rules are fully specified. | Manual play |
| RR-2 | Fact Map's scoring formula and whether an unlimited mode exists | Benchmark only | Manual play |
| RR-3 | Farflung's rarity computation | Benchmark only. Deep Cut defines its own. | Read Farflung's Rulings page and blog |
| RR-4 | How Worldle computes country "centers" | Benchmark only. Silhouette defines its own (§5.3). | — |

## 8. Originality guardrails

Meridian MUST NOT copy reference products' names, logos, color schemes, copy text, rarity tier names, share-grid emoji layouts or puzzle data. Specifically:

- Game names are original: Quiz Library, Silhouette, Fact Pin, Atlas Explorer, Deep Cut, Border Run, Rank It, Chronology, Lost Borders, Knowledge Run.
- Deep Cut rarity tiers are named **Obvious, Solid, Sharp, Deep, Deep Cut**. Farflung's tier names are not used.
- The share format is Meridian's own (see [UX_AND_DESIGN §9](UX_AND_DESIGN.md#9-sharing)).
- All content (facts, prompts, aliases) is written for Meridian or derived from openly licensed datasets ([DATA_AND_CONTENT.md](DATA_AND_CONTENT.md)).
