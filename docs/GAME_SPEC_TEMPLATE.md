# Game Specification Template

Every game in [`games/`](games/) MUST follow this template, with the 12 numbered sections in this order. Copy this file to `games/<slug>.md` for a new game and replace every `…`. A section may say "Not applicable" only with a one-line reason.

---

```markdown
# <Game Name>

| Field | Value |
|---|---|
| Game ID | G-XX |
| Slug / route | `/play/<slug>` |
| Phase | R1 / R2 / R3 / R4 |
| Status | Draft / Approved / Implemented |
| Inspiration | <reference> (Observed) / Original |
| Depends on | <components and content packs, with links> |
| Governing ACs | AC-XX-001 … AC-XX-0NN |

## 1. Purpose and player experience
- What the player learns or practices.
- The emotional arc of a round (e.g., "uncertainty → narrowing → reveal").
- Target round length (seconds) and session length.
- Which personas this serves (see PRODUCT_VISION §3).

## 2. Rules and complete gameplay loop
- Numbered rules. Each is testable.
- A Mermaid state or sequence diagram of one round and of the session.
- Win, loss and end conditions.

## 3. Modes and configuration
| Mode | Description | Phase |
- Configuration options table: option, values, default, effect.

## 4. Data requirements
- Content packs and fields used (link DATA_MODEL).
- Pool size per default configuration, and the minimum needed for unlimited play.
- Example records.

## 5. Answer validation or interaction rules
- Exact acceptance rules, ambiguity handling, input methods.

## 6. Scoring and difficulty
- Exact formulas with worked examples.
- How difficulty tiers change generation.

## 7. Hints and feedback
- Hint ladder (order, cost, availability).
- Per-action feedback (visual + text + screen reader announcement).

## 8. Screens and state transitions
- Text wireframes for each screen at mobile and desktop widths.
- State machine (states, events, transitions).

## 9. Edge cases
| Case | Expected behavior |

## 10. Accessibility and mobile behavior
- Keyboard map, screen reader strategy, non-color feedback, touch targets, small-screen layout.

## 11. Unlimited-play and repeat-prevention behavior
- Generation algorithm, Repeat Guard window, pool exhaustion behavior, seeded/daily behavior, replaying a completed seed.

## 12. Acceptance criteria
| ID | Given / When / Then | Example |
- At least 10 criteria with concrete data examples.
```

---

## Writing rules

1. **Be concrete.** Write "4 options, 1 correct, 3 distractors from the same subregion where possible", never "some options".
2. **Use real data** in examples (`country:FRA`, "Côte d'Ivoire"), not placeholders.
3. **Reference shared behavior** instead of re-specifying it: name matching ([quiz-library §5](games/quiz-library.md#5-answer-validation-and-interaction-rules)), the Repeat Guard ([ARCHITECTURE §8](ARCHITECTURE.md#8-puzzle-generation-reproducibility-and-difficulty)), session persistence ([ARCHITECTURE §9](ARCHITECTURE.md#9-state-management-session-persistence-and-result-storage)), and platform states ([UX_AND_DESIGN §8](UX_AND_DESIGN.md#8-system-states-loading-empty-error-offline-interrupted)).
4. **Separate Observed from Proposed** when a reference inspired the game.
5. **Every AC must be automatable** by a unit, integration or Playwright test. If it is not, mark it `[manual]` and explain why.
6. Every new configuration option needs a default and a phase.
