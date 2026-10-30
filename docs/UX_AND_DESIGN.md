# UX and Design

This document defines the shared shell, information architecture, interaction patterns, visual system and platform-level behaviors. Game-specific screens are in each game spec's §8.

## 1. Information architecture

```mermaid
graph TD
  H[Home /] --> PLAY[Play catalog /play]
  H --> DAILY[Daily hub /daily]
  H --> EX[Atlas /explore]
  H --> ME[Profile & stats /me]
  PLAY --> QZL[Quiz Library /play/quiz]
  QZL --> QZ[Quiz /play/quiz/:slug]
  PLAY --> GAME[Game hub /play/:game]
  GAME --> SESSION[Game session — same route, state-driven]
  C[Challenge link /c/:code] --> SESSION
  ME --> ACH[Achievements /me/achievements]
  ME --> HIST[History /me/history]
  S[Settings /settings]
  ABOUT[About & sources /about, /about/sources, /about/rules]
  REPORT[Report a problem: dialog on every result + /about/corrections changelog]
  ADMIN[/admin — R3, editors only]
```

### 1.1 Routes

| Route | Page | Phase |
|---|---|---|
| `/` | Home | R1 |
| `/play` | Game catalog (all games + quiz highlights, search, filters) | R1 |
| `/play/quiz` | Quiz Library browser | R1 |
| `/play/quiz/[slug]` | Configure + play a quiz (query params encode config) | R1 |
| `/play/[game]` | Game hub (configure + play). Games: `silhouette`, `fact-pin` (R1), `deep-cut`, `border-run`, `rank-it` (R2), `chronology`, `lost-borders`, `knowledge-run` (R3) | per game |
| `/daily` | Today's optional dailies across games | R1 (Silhouette and Fact Pin dailies) |
| `/explore`, `/explore/[entityId]` | Atlas Explorer | R2 |
| `/c/[code]` | Challenge resolver. Redirects to the game with the seed config. | R1 |
| `/me`, `/me/history`, `/me/achievements` | Profile, stats, history, achievements | R1 (stats, history), R2 (achievements) |
| `/settings` | Settings | R1 |
| `/signin` | Optional sign-in | R2 |
| `/about`, `/about/sources`, `/about/rules`, `/about/corrections`, `/about/privacy` | Static info | R1 |
| `/admin/*` | Editorial console | R3 |

## 2. Global shell

```
Desktop (≥1024)
┌──────────────────────────────────────────────────────────────────────┐
│ ◎ Meridian   Play   Daily   Explore(R2)        [⌕ Search]  ☆  ⚙  (●) │
└──────────────────────────────────────────────────────────────────────┘
Mobile (<640): top bar = logo + search icon + profile; bottom tab bar:
┌──────────┬──────────┬──────────┬──────────┐
│  ▶ Play  │  ◷ Daily │ 🗺 Explore│  ● Me    │
└──────────┴──────────┴──────────┴──────────┘
```

- During an active game session, the global nav **collapses** to a slim game header (← Back, title, progress, timer, ⋯ menu). This maximizes the map area. Leaving an in-progress session asks "Leave quiz? Your progress is saved and you can resume." [Leave] [Stay].
- The `⋯` menu in a game contains: Pause, Restart, Settings for this game, How to play, Report a problem, Share challenge.

## 3. Key pages

### 3.1 Home `/`

```
┌───────────────────────────────────────────────────────────┐
│ Know the world. Play as long as you like.                 │
│ [▶ Play something now]  ← starts a random R1 game, Normal │
├───────────────────────────────────────────────────────────┤
│ Continue: Countries of the World — 88/197 · 6:41 left [▶] │  (only if a resumable session exists)
├───────────────────────────────────────────────────────────┤
│ Games:  [Silhouette] [Fact Pin] [Quiz Library]  …         │  cards: name, 1-line pitch, ▶
├───────────────────────────────────────────────────────────┤
│ Popular quizzes (6 tiles)       Practice your weak spots ▸ │
├───────────────────────────────────────────────────────────┤
│ Today (optional): Silhouette daily ✓ · Fact Pin daily ○   │
└───────────────────────────────────────────────────────────┘
```

**Rule:** the "Today" module is never above the games module, and is never shown as a blocking modal.

### 3.2 Play catalog `/play`

- **Search** (title, tags, entity names, so "Peru" finds quizzes and games involving Peru). Client-side index over the catalog manifest. Results appear in < 50 ms.
- **Filters** (chips, combinable): Topic (Countries, Capitals, Flags, Regions, Subdivisions, Cities, Physical, History, Mixed), Format (Type, Map, Choice, Order, Deduction, Pin), Length (< 2 min, 2–5, 5–15, Endless), Difficulty, Region (continent), Favorites only.
- **Favorites:** a ☆ on every game and quiz card. Stored locally (R1) and synced (R2).
- Sort: Recommended (default: unplayed first, then weak spots, then popular), A–Z, Recently played.
- Empty state: "No games match *History + Under 2 min*. [Clear filters]".

### 3.3 Game hub / configure

Each game has one page that shows **Configure** (a compact form with sensible defaults) and then switches to **Play** in place (no route change, so Back returns to Configure, with a confirmation if the game is in progress). The **[▶ Play]** button is always visible without scrolling, and "More options ▸" is collapsed by default.

### 3.4 Result summary (shared template)

All games use the same result layout. The content slots are filled by each game.

```
┌────────────────────────────────────────────────────────┐
│ HEADLINE: score / outcome + PB delta                   │
│ [▶ Play again] [↻ Replay same] [◎ Practice misses] [⤴ Share]│
├────────────────────────────────────────────────────────┤
│ LEARN: what you missed and why (map + list)            │
│   each item → entity card (capital, flag, facts, Atlas)│
├────────────────────────────────────────────────────────┤
│ STATS: this game's trend (last 10), mastery changes    │
│ Report a problem with this round ▸                     │
└────────────────────────────────────────────────────────┘
```

"Play again" is always the primary (filled) button and gets focus.

### 3.5 Profile `/me`

Sections: overview (games played, total rounds, active days), per-game stats (§7), **mastery map** (a world map shaded by average mastery per country across skills, with a pattern legend), history (last 200 results, filterable), favorites, achievements (R2), and data controls (export JSON, import JSON (R1); delete local data; sign in to sync (R2)).

### 3.6 Settings `/settings`

| Setting | Values | Default | Phase |
|---|---|---|---|
| Theme | System, Light, Dark | System | R1 |
| Distance units | km, mi | from locale | R1 |
| Reduced motion | System, On, Off | System | R1 |
| Answer strictness (global default) | Lenient, Standard, Strict | Standard | R1 |
| Country set (global default) | sovereign-197, un-193, +territories | sovereign-197 | R1 |
| High-contrast map palette | On, Off | Off | R1 |
| Accessible variants by default | On, Off | Off | R1 |
| Sounds | On, Off | Off | R1 |
| Extra answer languages | es, fr, de, pt, it, nl | none | R2 |
| Streaks | Off, On | **Off** | R2 |
| Anonymous answer telemetry | On, Off | On (with notice) | R2 |

## 4. Interaction patterns (shared components)

| Component | Behavior summary | Spec |
|---|---|---|
| `AnswerInput` | Text input with no autocorrect. Keystroke matching (TYPE_ALL) or submit matching. Optional suggestions listbox (combobox pattern). Inline status line below (aria-live). | [quiz-library §5](games/quiz-library.md#5-answer-validation-and-interaction-rules) |
| `GameMap` | Pan and zoom, select-entity mode, free-pin mode, highlight mode, tiny-target rings, loupe on touch, spatial keyboard navigation, pattern fills | [ARCHITECTURE §6](ARCHITECTURE.md#6-map-rendering-geometry-projections-and-asset-delivery) |
| `ChoiceGrid` | 2–16 options as buttons. Number-key shortcuts for ≤ 9 options. Image or text. | — |
| `OrderList` | Drag-and-drop plus keyboard pick-up/move/drop, with move buttons on touch | [rank-it §5](games/rank-it.md#5-answer-validation-and-interaction-rules) |
| `TimerBadge` | Countdown or count-up, pause on hidden, warning at 10% (min 10 s) | [ARCHITECTURE §9](ARCHITECTURE.md#9-state-management-session-persistence-and-result-storage) |
| `EntityCard` | Name, flag, capital, key stats with source and year, neighbors, facts, actions | [atlas-explorer §8](games/atlas-explorer.md#8-screens-and-state-transitions) |
| `ResultSummary` | §3.4 | — |
| `ShareSheet` | Web Share API, falling back to copy-to-clipboard | §9 |
| `ReportDialog` | §10 | — |

### 4.1 Keyboard conventions (global)

| Key | Action |
|---|---|
| `/` | Focus search (outside text inputs) |
| `?` | Shortcuts dialog |
| `Esc` | Close dialog / pause game |
| `Enter` | Submit / confirm / next |
| `1`–`9` | Choose option N in a ChoiceGrid |
| `H` | Hint (when no text input is focused, or `Alt+H`) |
| `+` / `−` / `0` | Map zoom in / out / reset |
| Arrow keys | Map spatial focus navigation (when the map has focus) |

## 5. Visual system

### 5.1 Brand direction

"**Cartographer's desk**": warm paper surfaces, ink-navy text, restrained accents, and clean maps. The look is calm and editorial, never neon or gamified-casino. It is original and does not resemble the reference products' visual identities.

**Design inspiration (owner request):** [siteinspire.com](https://www.siteinspire.com/). What the featured editorial sites share, and what Meridian takes from them: large light-weight display type, minimal chrome (a wordmark and one menu control), generous whitespace and content-first layouts. Meridian keeps its own palette and type (below) and never copies another site's layout or imagery.

### 5.2 Design tokens

| Token | Light | Dark | Use |
|---|---|---|---|
| `--color-bg` | `#F7F4EE` (paper) | `#12161C` | Page background |
| `--color-surface` | `#FFFFFF` | `#1B2129` | Cards, panels |
| `--color-text` | `#1A2433` (ink) | `#E8ECF1` | Body text |
| `--color-text-muted` | `#5A6576` | `#9AA6B5` | Secondary text |
| `--color-accent` | `#B4532A` (terracotta) | `#E07A4F` | Primary buttons, highlights |
| `--color-ocean` | `#DCE8EF` | `#1A2B38` | Map water |
| `--color-land` | `#EFE9DD` | `#2A3139` | Map land default |
| `--color-border-map` | `#9AA3AE` | `#5B6673` | Country borders |
| `--color-correct` | `#1F7A4D` | `#4CC38A` | Always paired with ✓ / solid fill |
| `--color-wrong` | `#B42318` | `#F97066` | Always paired with ✕ / hatch |
| `--color-near` | `#B7791F` | `#F0B429` | Always paired with ◐ / dots |
| `--color-focus` | `#1D4ED8` | `#93C5FD` | 3 px focus ring |
| `--color-text-on-accent` | `#FFFFFF` | `#12161C` | Label on an accent fill (primary button) |
| `--color-border` | `#DDD6C8` | `#2C353F` | Decorative card and divider borders (no contrast requirement) |
| `--color-border-strong` | `#7D8794` | `#7C8896` | Borders of inputs and buttons (≥ 3:1, WCAG 1.4.11) |

All text/background pairs meet WCAG 2.2 AA (4.5:1 body, 3:1 large text and UI components). Feedback colours (`correct`, `wrong`, `near`) are graphics paired with a glyph, so they need 3:1. Message text stays in `--color-text`. The focus ring is always drawn with a positive `outline-offset`, so it sits next to the page or card colour and never touches an accent fill (blue on terracotta is only about 1.3:1). Map tokens (`ocean`, `land`, `border-map`) are verified together with `GameMap` in T0.10. The CI token test verifies this ([TESTING_AND_ACCEPTANCE §3](TESTING_AND_ACCEPTANCE.md#3-platform-acceptance-criteria)).

**Themes:** every screen ships in light and dark. The default follows the system (`prefers-color-scheme`). A System / Light / Dark switch (in the footer now, in Settings later) overrides it. The choice is saved on the device (`localStorage["meridian:theme"]`, absent means System) and applied by a tiny inline script in `<head>` before first paint, so it never flashes. When a CSP is added (T0.12) that script needs a nonce or hash. Selected state is shown with a ✓ and bold text, not colour alone.

**Typography:** UI font `Source Sans 3`, display/headings `Source Serif 4`, numerals tabular (`font-variant-numeric: tabular-nums`) for timers and scores. All are SIL OFL fonts, self-hosted. Scale (rem): 0.75, 0.875, 1, 1.125, 1.375, 1.75, 2.25. Body line-height 1.5.

**Spacing:** 4 px base (4, 8, 12, 16, 24, 32, 48, 64). Radius: 6 px for controls, 12 px for cards. Elevation: a 1 px border first, with shadows only on overlays.

**Map feedback patterns** (SVG `<pattern>`): `solid` (correct), `hatch-45` (missed/wrong), `dots` (near/close), `cross-hatch` (disputed), `diagonal-light` (no data). Every pattern renders in forced-colors mode using `CanvasText`/`Canvas`.

**Choropleth palettes:** sequential 5-class palettes, validated for CVD (e.g. a viridis-derived ramp). Categorical: an 8-color colorblind-safe set (Okabe–Ito order).

**Iconography:** a single outline icon set (Lucide, ISC license). Glyphs ✓ ✕ ◐ ⇆ ◆ are used as redundant feedback markers alongside color.

**Motion:** durations 120 ms (micro), 200 ms (panels), 400 ms (reveals). Easing `cubic-bezier(.2,.8,.2,1)`. With `prefers-reduced-motion`, there is no movement, only opacity or instant changes.

## 6. Responsive layouts

| Breakpoint | Width | Layout rules |
|---|---|---|
| `sm` | < 640 px | Single column, bottom tab bar, game header 48 px. The map fills the available height. Input pinned above the keyboard via `visualViewport`. Bottom sheets for panels. |
| `md` | 640–1023 px | Tablet: the map is the main area, with side panels as overlays (portrait) or a right rail of 320 px (landscape) |
| `lg` | ≥ 1024 px | Full top nav, right rail of 360 px for game panels, max content width of 1280 px for non-map pages |

Rules: no horizontal page scroll at 320 px or wider. Touch targets ≥ 44×44 px. Maps are never inside a scrolling container on touch devices (game screens use a fixed `100dvh` layout).

## 7. Progress, statistics, achievements and streaks

### 7.1 Statistics (R1, local)

| Scope | Metrics |
|---|---|
| Global | Rounds played, active days, time played, games tried |
| Per game | Rounds, win/solve rate, average score, best score, average guesses (Silhouette), Fact Pin average points, trend sparkline (last 20) |
| Per quiz PB key | Best score + time, attempts, last played |
| Per entity × skill | Mastery 0–1, exposures, last seen, due date ([quiz-library §11](games/quiz-library.md#11-unlimited-play-and-repeat-prevention-behavior)) |

The **mastery map** on `/me` shades each country by its mean mastery across `recall`, `locate`, `flag`, `capital` and `shape`. Unplayed = no fill + "not yet played" in the tooltip.

### 7.2 Achievements (R2)

Personal only (no public leaderboard). Examples, all deterministic from local results:

| ID | Name | Condition |
|---|---|---|
| ACH-QZ-197 | Full Atlas | Name all countries in Countries of the World (timed) |
| ACH-QZ-CONT | Six for Six | 100% on all six continent TYPE_ALL quizzes |
| ACH-SH-FIRST | First Look | Solve a Silhouette in 1 guess |
| ACH-SH-50 | Shape Shifter | Solve 50 Silhouettes |
| ACH-FP-PIN | Bullseye | Score 1000 on an exact-precision fact |
| ACH-AE-AF | Grand Tour: Africa | Open every African country card in Atlas |
| ACH-DC-5 | Off the Map | 5 Deep Cut-tier answers in one run |
| ACH-MS-80 | Cartographer | Average mastery ≥ 0.8 across all 197 countries |

There are about 40 achievements at R2. They are defined in data (`content/achievements.yaml`) and evaluated client-side after each result.

### 7.3 Streaks (R2, opt-in)

- **Off by default.** When on: the streak increases on any local day with ≥ 1 completed round in *any* game (not only dailies).
- **2 freeze days** are automatically banked per 14-day period. A missed day consumes a freeze silently.
- There are no streak-loss notifications, no guilt copy, and no streak shown in the global header. It appears only on `/me`.

## 8. System states: loading, empty, error, offline, interrupted

| State | Behavior | Copy (example) |
|---|---|---|
| Initial load | The shell renders immediately. Game areas show skeletons after 300 ms if the content isn't ready (no flash before then). | — |
| Content pack loading (> 1 s) | Progress bar with the size ("Loading world map · 180 KB"). The configure screen stays usable. | "Loading map data…" |
| Pack load failure | Inline error with Retry. Other games stay available. | "We couldn't load the map data. Check your connection and try again. [Retry]" |
| Offline (R1) | Detected via `navigator.onLine` + failed fetches. A banner says sync is paused. Games with cached packs work. Uncached games show "Available when you're back online". | "You're offline. Games you've played recently still work." |
| Offline (R2, PWA) | The service worker precaches the shell + R1 packs. All R1 games are fully playable offline. Results queue for sync. | — |
| Empty history / stats | Explain and offer an action | "No rounds yet. Your stats appear after your first game. [Play Silhouette]" |
| Empty search | Suggest clearing filters | §3.2 |
| Interrupted session (reload, crash, tab closed) | Resume prompt on the game page **and** a "Continue" card on Home, for up to 7 days | "Resume *Countries of the World*? 88/197 · 6:41 left [Resume] [Discard]" |
| Session from an older content version | Resume if that pack version is still cached or available, otherwise offer a restart | "This quiz was updated since you started. [Start again]" |
| Server error on sync (R2) | Silent retry with backoff. After 24 h of failure, a non-blocking notice on `/me`. | "Some results haven't synced yet. They're safe on this device." |
| Challenge link invalid or corrupted | Friendly page with a CTA | "This challenge link doesn't work. It may be incomplete. [Play Silhouette instead]" |
| Challenge from a newer content version than cached | Fetch the required version. If it's unavailable, explain. | — |
| Storage unavailable (private mode quota) | Play works in memory. Banner: progress won't be saved. | "Your browser isn't letting us save progress. You can still play." |

## 9. Sharing

- **Share text** is spoiler-free, original in format, and always includes a challenge link:

```
Meridian · Silhouette · 2026-11-05
▰▰▰▰▰▱▱▱▱▱ ↗
▰▰▰▰▰▰▰▰▰▱ ↗
✓ 3/6 · capital ✓ · flag ✕
meridian.example/c/SH-4KQ2-M9XD
```

- Quiz share: `Meridian · Countries of the World · 171/197 in 12:02 · meridian.example/c/QZ-...`
- A challenge link reproduces the same puzzle(s) for the recipient ([ARCHITECTURE §8.4](ARCHITECTURE.md#84-challenge-codes)). If the sender's score is embedded (an optional `s` parameter), the recipient sees "Beat 171/197?" before starting and a side-by-side comparison after finishing.
- An Open Graph image is generated per game type (static per game in R1, dynamic per result in R2).

## 10. Content corrections (player-facing)

- "Report a problem" appears on every result and entity card.
- Dialog: **category** (Wrong answer accepted, Correct answer rejected, Wrong fact, Map/border issue, Spelling/name, Offensive/sensitive, Other), **free text** (10–1,000 characters), and auto-attached context (game, round seed, content version, entity or fact ID, the player's input). Optional email (R1) or the account (R2).
- After sending: "Thanks. Our editors review reports within 7 days. Changes are listed on the corrections page." There is no promise of a reply without an email.
- `/about/corrections` is a public changelog of content changes (generated from content release notes) (R1). Individual rulings with IDs appear from R3.

## 11. Guest play and optional accounts

| Capability | Guest (R1+) | Account (R2+) |
|---|---|---|
| Play every game and mode | ✅ | ✅ |
| Stats, mastery, history, favorites, settings | ✅ local (IndexedDB) | ✅ synced |
| Resume sessions | ✅ same device | ✅ same device. Cross-device resume of *untimed* sessions only. |
| Achievements and streaks | ✅ local | ✅ synced |
| Export/import data | ✅ JSON file | ✅ + server export |
| Report problems | ✅ (optional email) | ✅ |

- **Sign-in methods (R2):** email magic link + Google. No passwords.
- **Merge on first sign-in:** local data is uploaded and merged (results union by result ID, mastery by most recent exposure, favorites union, settings: local wins with a prompt if the server already has settings).
- Signing out keeps a local copy only if the player chooses "Keep a copy on this device".
- Account deletion is a self-service action with immediate effect on personal data ([ARCHITECTURE §12](ARCHITECTURE.md#12-security-and-privacy)).
