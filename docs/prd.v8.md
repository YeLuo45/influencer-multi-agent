# PRD v8 — Safe Execute + Web Mode Enhancement Batch

## Background
v7 introduced production execution readiness. v8 finishes the next unattended batch by turning readiness into a safer operator loop while keeping all real-world side effects gated.

## Scope
- Real connector execution adapter contract: `prepare → dryRun → approval → execute → verify → rollback`.
- Persistent approval queue model with append-only rows and exact approval tokens.
- Credential health center for masked Web-visible credential cards.
- CI artifact ingest execution summary for GitHub Actions evidence.
- Replay scenario library for Web-mode dry-run rehearsals.
- Release Ops event timeline for one-screen operator review.
- Safe Execute CLI that only executes already-approved actions.
- Delivery report next-iteration directions focused on Web mode experience and functionality.

## Safety
- Default mode is dry-run.
- Web/API endpoints never post externally, mutate MCP status, push Git, or write credentials.
- CLI `safe-execute` requires exact persisted approval token.

## Acceptance
- Core pure helpers cover all seven directions.
- CLI `safe-execute` outputs dry-run or execute plans without direct side effects.
- `/api/production` exposes connector execution, approval store, credential health, CI ingest, scenarios, timeline, and Web-mode enhancements.
- Web production panel surfaces timeline, credential health, and next Web direction.
- Full hard gates pass: check, test, coverage, verify:readme, build.
