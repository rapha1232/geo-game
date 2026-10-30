# Open Questions and Risks

## Open questions

Each question has a **default** that the blueprint already uses, so implementation is not blocked. "Owner decision" means the repository owner should confirm or override the default.

### Q-01: Brand name

> **Decided (owner):** Use "Meridian".

- **Question:** Is "Meridian" the final name? It has not been checked for trademarks or domains, and "Meridian" is a common word used by many products.
- **Default:** Use "Meridian" as a working title behind a single config constant (`BRAND_NAME`) and the share-text template.
- **Needed by:** R1 launch (T1.21). **Owner decision.**

### Q-02: Domain and hosting accounts

> **Decided (owner):** Production URL `meridian-quiz.vercel.app` on Vercel. Database: Neon project `meridian-quiz`, connection via the `DATABASE_URL` environment variable (already configured in the cloud environment).

- **Question:** Which domain, Vercel team, Neon project and Blob store should be used?
- **Default:** Vercel + Neon under the owner's accounts. The domain is a placeholder (`meridian.example`) until decided.
- **Needed by:** T0.1 (preview) and T1.21 (production). **Owner decision.**

### Q-03: Default country set (197 vs 193)

> **Decided (owner):** Approved. Keep `sovereign-197` as the default.

- **Question:** Keep `sovereign-197` (including Kosovo and Taiwan) as the default?
- **Default:** Yes, with a visible explanation and a one-click switch to UN 193. **Owner decision** (sensitive).

### Q-04: Historical geometry license

> **Decided (owner):** Option 1 (isolated GPL-3.0 content pack).

- **Question:** The best open historical-borders dataset found (aourednik/historical-basemaps) is **GPL-3.0**. Options:
  1. Ship it as an isolated, GPL-3.0-licensed content pack, with derived geometry published in a public repository. App code is unaffected (it is data loaded at runtime), but legal review is advisable.
  2. Use CShapes 2.0 for 1886–2019 only (license not verified; possibly non-commercial, which our rules forbid).
  3. Commission or draw our own simplified historical maps for about 20 key years (high effort).
- **Default:** Option 1, pending a short legal check. Lost Borders (R3) is gated on this (AC-LB-013).
- **Needed by:** T3.1. **Owner decision.**

### Q-05: Sensitive-content policy sign-off

> **Decided (owner):** Approved as specified.

- **Question:** Confirm the capitals policy (e.g. Jerusalem accepted for Israel with a note; East Jerusalem and Ramallah for Palestine) and the disputed-area rendering ([DATA_AND_CONTENT §6–7](DATA_AND_CONTENT.md#6-what-counts-as-a-country)).
- **Default:** As specified. **Owner decision** before R1 launch.

### Q-06: License of Meridian's own content

> **Decided (owner):** All rights reserved. A Terms of Service and a Privacy Policy are required pages (added to T1.18, linked from the site footer).

- **Question:** Should Meridian-authored facts and prompts be published openly (e.g. CC BY 4.0) or kept all-rights-reserved?
- **Default:** All rights reserved until decided. This doesn't affect implementation.

### Q-07: Classroom / under-13 use

> **Decided (owner):** No classroom features. General audience 13+.

- **Question:** Should Meridian support teachers and classes, which could involve under-13 users?
- **Default:** No. General audience 13+. No class features. Revisit after R2, because it would require COPPA/GDPR-K compliance work.

### Q-08: Analytics vendor

> **Decided (owner):** Vercel Web Analytics.

- **Question:** Use Vercel Web Analytics, or a self-hosted cookieless alternative (e.g. Plausible or Umami)?
- **Default:** Vercel Web Analytics (cookieless, aggregate).

### Q-09: Fact authoring capacity

> **Decided (owner):** Facts are verified by a fact-check agent that uses real-world searches and cited sources. Drafts still enter as `status: draft` with source links, and are promoted to `published` only after the agent's verification is recorded in the fact's `sources`/review fields (T1.12 to define the field).

- **Question:** Who writes and reviews the ≥ 400 R1 facts (and ≥ 1,500 R3 events)?
- **Default:** Editors draft with source links. A coding agent may draft facts **only** as `status: draft` from cited open sources, and a human must review them before `published`. **Owner decision** on staffing. This is the largest content risk for R1 (see R-01).

## Assumptions

| ID | Assumption | If wrong |
|---|---|---|
| A-01 | No competitive leaderboards, so client-side scoring is acceptable | Add server-side replay verification ([ARCHITECTURE §4](ARCHITECTURE.md#4-system-overview-and-boundaries)) |
| A-02 | English-speaking primary audience for R1 | Pull extra answer languages forward from R2 |
| A-03 | World-scale maps don't need vector tiles | Switch Atlas deep zoom to MapLibre (ADR-003) |
| A-04 | Natural Earth 10m is accurate enough for point-in-polygon scoring at Fact Pin's tolerances (≥ 25 km) | Use geoBoundaries ADM0 for specific countries |
| A-05 | Spoilable daily schedules (in client packs) are acceptable | Serve daily targets from an API on the day |
| A-06 | The terms of Wikidata, World Bank and other sources marked ❓ are as commonly documented | T0.6 verifies them. Replace any source that fails verification. |

## Risks

| ID | Risk | Likelihood | Impact | Mitigation | Owner |
|---|---|---|---|---|---|
| R-01 | Fact bank not ready (400 quality facts with sources) | High | Delays R1 Slice C | Start T1.12 in Phase 0. Generated capital and city facts provide a playable floor (≈ 500). Launch with ≥ 300 curated if needed, keeping quotas. | Content |
| R-02 | Alias coverage gaps cause "correct answer rejected" frustration | Medium | High (trust) | Golden table, fuzzy matching, S1 hotfix SLA of 48 h, and a report button on every review | Content + Eng |
| R-03 | Sensitive geopolitical content provokes complaints | Medium | Medium | Neutral notes, transparent rules page, configurable sets, senior-editor review | Owner |
| R-04 | Historical data license (GPL) blocks Lost Borders | Medium | Medium (R3 only) | Q-04 options. The game is gated. | Owner |
| R-05 | Map performance on low-end mobile | Medium | High | LOD packs, SVG path count limits, canvas underlay, performance budgets in CI | Eng |
| R-06 | Tiny-target usability on touch | Medium | Medium | Rings + loupe + accessible variant. E2E on an emulated iPhone. | Eng |
| R-07 | Deep Cut rarity feels arbitrary before calibration | Medium | Medium | Published method, "provisional" label, editorial typicality overrides | Product |
| R-08 | Daily answers discoverable in packs | High | Low | Accepted (no stakes). Could move to an API later (A-05). | — |
| R-09 | Natural Earth de facto borders differ from some players' expectations | Medium | Low–Medium | Dispute overlays and notes. Any-claimant scoring. | Content |
| R-10 | Similarity to reference products (trade dress, names) | Low | High | Originality guardrails in [REFERENCE_RESEARCH §8](REFERENCE_RESEARCH.md#8-originality-guardrails) | Product |
| R-11 | Reference research gaps (JetPunk 403, Fact Map 429) led to wrong assumptions | Low | Low | Meridian's mechanics are fully specified independently. Manual play is suggested (RR-1…4). | Product |
| R-12 | Scope creep across 10 games | High | High | Strict phase gates. R1 = 3 games only. The catalog lists rejected ideas. | Owner |
| R-13 | IndexedDB eviction (Safari storage policies) loses guest progress | Medium | Medium | Request `navigator.storage.persist()`, prompt to export, offer accounts in R2 | Eng |
