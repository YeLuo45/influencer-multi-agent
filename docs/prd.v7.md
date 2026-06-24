# PRD v7 — Production Execution Readiness

## Background
v6 completed release-ops automation, but real operations still need a safe pre-execution layer before posting to external platforms or advancing production status.

## Scope
- Real platform connector hardening matrix across X, Reddit, YouTube, Bilibili, Weibo, Xiaohongshu.
- Operator approval queue for high/medium risk production actions.
- Persistent release-ops ledger plan under `.ima/release-ops/`.
- GitHub Actions CI auto-ingest plan that reads evidence without mutating repo state.
- Credential rotation and scope review plan with masked env keys.
- Production replay sandbox from trend to dry-run publish with zero side effects.
- Multi-run analytics for success rate, failed gates, durations, and platform error counts.

## Non-goals
- No real platform posting.
- No MCP status mutation from the Web endpoint.
- No credential values displayed or stored in responses.

## Acceptance
- `@ima/core` exposes pure production execution readiness helpers.
- `/api/production` includes `executionReadiness` with all seven sections.
- Web production panel shows execution readiness, connector readiness, approval queue, and replay dry-run status.
- Full hard gates pass: check, test, coverage, verify:readme, build.
