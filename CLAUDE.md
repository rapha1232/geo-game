# Instructions for coding agents

- Read `docs/AGENT_HANDOFF.md` before any implementation work. The blueprint in `docs/` is normative.
- `main` is the single source of truth. Work on a branch created from the latest `origin/main`, open a PR into `main`, and **auto-merge it** (enable auto-merge; if no required checks exist yet, merge it yourself once local checks pass). Never push directly to `main`.
- If the PR for your branch has already merged, restart the branch from `origin/main` for follow-up work.
- Every implementation task maps to a roadmap task ID (`T<phase>.<n>`) and its acceptance criteria (`AC-XX-NNN`). Name tests with the AC IDs.
- When behavior must deviate from a spec, update the spec in the same PR and explain why.
- When designing UI, take inspiration from [siteinspire.com](https://www.siteinspire.com/) (owner request). Its gallery sits behind a bot check for scripts, so open the featured sites it links to (a headless browser works) and look at the real pages. Keep Meridian's own identity (`docs/UX_AND_DESIGN.md` §5). Do not copy another site's layout, type or imagery.
