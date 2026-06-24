# Technical Solution v3 — Delivery Evidence & Safe Forward Gate

## Design
- Keep delivery evidence as zero-dependency pure helpers in `@ima/core/src/delivery-evidence.ts`.
- Do not mutate proposal state directly; helpers only produce a forward-only status plan.
- Extend `/api/production` additively, preserving existing fields (`replyQueue`, `tokenLedger`, `audit`, `channel`, `release`, `budget`).
- Render evidence in the existing Production tab by including the new JSON payload in `productionOutput`.

## Implementation Plan
1. Add `DeliveryGateInput`, `AcceptanceEvidence`, `SafeForwardPlan`, `DiffOwnership` contracts.
2. Add helpers:
   - `buildAcceptanceEvidence()`
   - `buildFailureChecklist()`
   - `buildSafeForwardPlan()`
   - `buildDiffOwnership()`
   - `buildDeliveryMarkdown()`
3. Export helpers from `@ima/core` barrel.
4. Extend `/api/production` with evidence/safeForward/failureChecklist/deliveryMarkdown.
5. Update README and `verify-readme.mjs` targeted command list.
6. Validate with targeted tests, then full hard gates.

## Constraints
- Zero new dependencies.
- Node built-in `node:test` only.
- TypeScript strict mode.
- No real platform publish; delivery evidence is local and read-only.
- MCP updates happen only after gates are green and only through forward transitions.
