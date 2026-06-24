# Technical Solution v2 — Production Operations Console

## Design
- Keep production logic in `@ima/core/src/production-automation.ts` as pure helpers.
- CLI remains a thin adapter for filesystem-backed JSONL ledgers under `.ima/`.
- Web server exposes a read-only production snapshot endpoint assembled from existing app state and local ledgers.
- Browser UI renders a discoverable production operations panel on the main console.

## Implementation Plan
1. Stabilize prior production helper exports and core dist build boundary.
2. Add `/api/production` server route backed by `buildProductionConsoleSnapshot`.
3. Add Web UI production panel with reply queue, budget, channel, release action, audit summary.
4. Extend README and `scripts/verify-readme.mjs` with production commands.
5. Run full gates: check, test, coverage, verify:readme, build.

## Constraints
- Zero new dependencies.
- TypeScript strict mode.
- Tests use `node:test` only.
- No real external platform calls; all reply/channel operations default to sandbox unless explicitly real.
