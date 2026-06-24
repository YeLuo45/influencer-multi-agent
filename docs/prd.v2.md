# PRD v2 — Production Operations Console

## Background
influencer-multi-agent 已具备生产自动化核心能力：reply sandbox、budget breaker、A/B winner、channel safety chain、audit JSONL、release local JSON。当前缺口是这些能力仍偏 CLI/核心层，Web/API 和 README 验收入口不够完整。

## Goals
- G1: 将生产控制能力暴露到 Web API，便于运营面板与 agent 自动化读取。
- G2: 首页 Web console 显示 reply queue、token ledger、audit、release action、channel readiness。
- G3: CLI production 输出读取真实 token ledger/audit，而不是静态快照。
- G4: README 命令覆盖 production / reply / token-ledger / channel-adapters，并由 verify:readme 真实执行。

## Scope
- Core: production automation helpers and snapshot contract.
- CLI: production commands and durable JSONL read/write.
- Web server/UI: production operations endpoint and visible panel.
- Tests: node:test RED/GREEN, no Jest/Vitest.
- Docs: README + docs index update.

## Acceptance
- npm run check exits 0.
- npm test exits 0 with 100% pass.
- npm run coverage exits 0 with configured thresholds.
- npm run verify:readme exits 0 and executes new production commands.
- npm run build exits 0.
- Local web endpoint returns HTTP 200 and /api/production returns non-empty JSON when server is started.
