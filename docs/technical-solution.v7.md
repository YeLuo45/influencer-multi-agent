# Technical Solution v7 — Production Execution Readiness

## Core module
Add `packages/core/src/production-ops.ts` as a pure side-effect-free module. It defines deterministic builders for:

- `buildPlatformConnectorHardeningMatrix`
- `buildApprovalQueue`
- `buildPersistentReleaseOpsLedger`
- `buildCiAutoIngestPlan`
- `buildCredentialRotationPlan`
- `buildProductionReplaySandbox`
- `buildMultiRunAnalytics`
- `buildProductionExecutionReadiness`

The module only returns plans, summaries, masked keys, and copy-ready commands. It never calls external platforms, GitHub, MCP, or filesystem writes.

## Web API
Extend `packages/cli/src/web-server.ts` `/api/production` response with `executionReadiness`:

- `connectorMatrix`: real platform readiness classification.
- `approvalQueue`: operator-gated production action queue.
- `ledger`: append-only `.ima/release-ops` paths plus hot/archive rows.
- `ciIngest`: deterministic GitHub Actions read plan.
- `credentialRotation`: masked secret health and scope review.
- `replaySandbox`: dry-run replay steps.
- `analytics`: multi-run success/failure trend.

## UI
Update `apps/web/app.js` production operations panel to surface:

- execution status badge;
- connector ready/total badge;
- approval queue size;
- replay sandbox side-effect status;
- full `executionReadiness` JSON in the operator payload.

## Test strategy
- Core node:test coverage for all pure builders and the combined readiness object.
- Web server contract test for `/api/production` response fields.
- Static Web UI discoverability test for `executionReadiness`, `connectorMatrix`, `approvalQueue`, and `replaySandbox`.
