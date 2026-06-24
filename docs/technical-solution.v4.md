# Technical Solution v4 — Delivery Automation Full Loop

## Design
- Extend `@ima/core/src/delivery-evidence.ts` with pure helpers only; no filesystem or MCP side effects in core.
- Keep CLI commands safe by default: `safe-forward` prints dry-run commands unless the caller supplies the exact confirmation token in future iterations.
- Extend `/api/production` additively, preserving all v3.6 fields.
- Keep Web UI zero-dependency: production tab renders the expanded JSON payload.

## Implementation Plan
1. Add tests for history, safe-forward command plan, runbook, CI ingestion, and recommendation ordering.
2. Add core helpers:
   - `buildDeliveryHistorySnapshot()`
   - `buildSafeForwardCommandPlan()`
   - `buildProductionRunbook()`
   - `ingestCiEvidence()`
   - `recommendNextIterations()`
3. Extend CLI `production`, `delivery safe-forward`, and `delivery runbook`.
4. Extend Web `/api/production` payload and UI rendering.
5. Update README and `verify-readme.mjs` so new commands are executable gates.
6. Run targeted and full hard gates.

## Constraints
- Zero new dependencies.
- Node built-in `node:test` only.
- TypeScript strict mode.
- No real MCP execution from CLI unless explicit future confirmation support is added and tested.
