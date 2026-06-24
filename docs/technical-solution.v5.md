# Technical Solution v5 — Push Recovery + Executable Delivery Actions

## Design
- Keep new logic in `@ima/core/src/delivery-evidence.ts` as pure helpers.
- CLI and Web only assemble and expose helper output; no real MCP or Git side effects are performed by production endpoints.
- `safe-forward` remains dry-run unless exact confirmation is supplied; current CLI exposes the confirmation token and commands.
- JSONL helpers operate on strings so filesystem adapters can stay thin and testable.

## Implementation Plan
1. Extend delivery evidence tests with push recovery, execute confirmation, JSONL history, Web actions, and CI summary parsing.
2. Implement helpers:
   - `buildPushRecoveryPlan()`
   - `buildDeliveryHistoryJsonl()` / `parseDeliveryHistoryJsonl()`
   - `buildWebActionManifest()`
   - `parseCiRunSummary()`
3. Add `webActions` to CLI `production` and Web `/api/production` payloads.
4. Update Web rendering to include `webActions` in production tab JSON.
5. Update README/docs and run full hard gates.

## Constraints
- Zero new dependencies.
- TypeScript strict mode.
- Node built-in `node:test` only.
- No secret/token output in runbooks or action payloads.
