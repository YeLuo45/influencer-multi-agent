# PRD v9 — Web Ops Completion Batch

Proposal: P-20260625-009
Project: PRJ-20260620-002 influencer-multi-agent
Mode: unattended

## Goal
Complete all remaining Web Ops directions as one cohesive operator-facing production layer.

## Scope
- Expose Web Mode Experience Pack in the production API payload.
- Add safe execute action planning for Web buttons.
- Add credential wizard state for masked setup guidance.
- Add replay scenario persistence plan.
- Add operator session timeline and copy-ready replay output.
- Add CI artifact import surface in the production snapshot.
- Add delivery closure automation plan for proposal status forward-only closure.

## Acceptance
- Core pure helpers are covered by node:test.
- `/api/production` returns the new Web Ops payload fields without side effects.
- Static Web UI exposes visible production action controls.
- `npm run check`, `npm test`, `npm run coverage`, `npm run build`, and `npm run verify:readme` pass.
- Local Web root and `/api/production` return HTTP 200.
