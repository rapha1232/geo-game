# Manual accessibility checklist (release gate)

Automated checks run with `pnpm --filter @meridian/web a11y` against a production build (`next start -p 3111`). It runs axe-core (WCAG 2.0 and 2.1 A and AA) on every route and on the main game states at 1100 px and 390 px, and checks that every button and link is at least 44 × 44 CSS px on mobile. It must print "No findings." before a release.

A person must still do the following per release ([TESTING_AND_ACCEPTANCE §5](TESTING_AND_ACCEPTANCE.md#5-accessibility-verification)). Record the date, the browser and screen reader versions, and any failure in the release notes.

## Setup

- NVDA with Firefox (Windows). VoiceOver with Safari on macOS and on iOS.
- Turn on **Accessible variants by default** in Settings so the map-free variants are used.
- Test with the keyboard only, then with the screen reader.

## Each R1 game: one full round

For **Silhouette**, **Quiz Library** (one type-in quiz and one multiple-choice quiz) and **Fact Pin**:

1. Reach the game from Home using only the keyboard (Tab, Shift+Tab, Enter, Space, arrows).
2. The page has one `h1`, headings in order, and a landmark for the main content.
3. Start a round. Focus lands somewhere sensible, never on a hidden element.
4. Every control has a name that says what it does ("Show the continent", not "Button").
5. Answer. The result is announced without moving focus (live region): correct or not, the score, the distance.
6. Silhouette: each guess row is read as a sentence (name, distance, direction, percent).
7. Fact Pin: type a place, choose it with Enter, press Enter again to confirm. The pin position is announced.
8. The review or reveal screen lists sources as links with their titles.
9. Open **Report a problem**: focus moves into the dialog, Esc closes it, focus returns to the button.
10. Nothing is conveyed by colour alone (hatching and symbols on the map and results).

## Zoom and text

- 200% browser zoom: nothing is cut off, no horizontal scrolling on the main content.
- Text spacing bookmarklet (line height 1.5, letter spacing 0.12 em, word spacing 0.16 em, paragraph spacing 2 em): no clipped or overlapping text.

## Motion and colour

- Settings → Reduced motion → "Always reduce": nothing slides, fades in position or animates.
- Windows forced colors (High Contrast): the map outlines, patterns and focus ring stay visible.
- Settings → High-contrast map colours: land and sea are clearly separated in light and dark themes.

## Result

| Date | Tester | Browser and reader | Pass or fail | Notes |
|---|---|---|---|---|
| | | | | |
