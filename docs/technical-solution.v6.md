# Technical Solution v6 — Release Ops Full Automation Batch

## Design
- Keep all new business logic in `packages/core/src/delivery-evidence.ts` as pure functions.
- Keep CLI/Web as adapters that assemble existing evidence into payloads; no real Git/MCP side effects are executed by `/api/production`.
- Web UI renders a visible operator action center while preserving raw JSON for audit/debug.

## Implementation
1. Add pure helpers:
   - `buildReleaseOpsDashboard()`
   - `buildSafeForwardExecutionPlan()`
   - `compactDeliveryHistoryLedger()`
   - `buildStructuredRunbook()`
   - `buildReleaseLocalHardeningPlan()`
2. Extend CLI `production` payload with dashboard, execution, structured runbook, compaction, and hardening fields.
3. Extend Web `/api/production` with the same fields.
4. Render `production-actions` cards in `apps/web/app.js`, including copy/download action buttons and failed queue summary.
5. Add tests across core, web server API, and static web UI.

## Constraints
- Zero new dependencies.
- No real MCP/Git mutation in Web endpoints.
- TypeScript strict mode.
- `node:test` only.
