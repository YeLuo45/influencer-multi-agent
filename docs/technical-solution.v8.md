# Technical Solution v8 — Safe Execute + Web Mode Enhancement Batch

## Core
Extend `packages/core/src/production-ops.ts` with pure helpers:

- `buildRealConnectorExecutionPlan`
- `buildPersistentApprovalStore`
- `buildCredentialHealthCenter`
- `buildCiArtifactIngestExecution`
- `buildReplayScenarioLibrary`
- `buildReleaseOpsEventTimeline`
- `buildSafeExecutePlan`
- `buildWebModeEnhancementDirections`

All helpers are deterministic and side-effect free.

## CLI
Add `ima safe-execute <action-id> --approval <token>`.

The command reads the generated approval rows from the production payload, then returns the `buildSafeExecutePlan` JSON. It does not execute shell commands directly; it exposes whether execution is allowed and what command would be run.

## Web API
Extend `/api/production` with:

- `connectorExecution`
- `approvalStore`
- `credentialHealthCenter`
- `ciArtifactIngest`
- `replayScenarios`
- `eventTimeline`
- `safeExecutePreview`
- `webModeEnhancements`

## Web UI
Update the production operations panel to show:

- timeline event count;
- credential health status;
- next Web-mode enhancement direction;
- full JSON sections for operator inspection.

## Tests
- Core node:test tests cover every new helper.
- CLI tests cover `safe-execute` and production payload fields.
- Web server contract test covers all new `/api/production` sections.
- Static Web UI test covers field discoverability.
