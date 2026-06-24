# PRD v3 — Delivery Evidence & Safe Forward Gate

## Background
Production Operations Console 已暴露 reply queue、token ledger、audit、channel 和 release action，但无人值守交付还缺一个可机器读取的验收证据层：哪些门禁通过、失败时下一步是什么、MCP 状态机是否允许继续推进。

## Goals
- G1: 提供纯函数 delivery evidence 模型，聚合 check/test/coverage/verify:readme/build 五门禁。
- G2: 失败时生成 deterministic remediation checklist，禁止无人值守误标 accepted/delivered。
- G3: 全绿时生成 MCP safe-forward plan：in_test_acceptance → accepted → deployed → delivered。
- G4: Web `/api/production` 暴露 evidence/safeForward/failureChecklist/deliveryMarkdown，首页生产运营 tab 可见。
- G5: README 与 verify:readme 纳入新 targeted test，保证命令真实可跑。

## Scope
- Core: `delivery-evidence.ts` pure helpers and tests.
- CLI/Web server: `/api/production` payload extension.
- Web UI: production tab includes delivery evidence fields.
- Docs: README + docs index v3.

## Acceptance
- `node --test --import tsx packages/core/test/delivery-evidence.test.ts` passes.
- `node --test --import tsx packages/cli/test/web-server-production.test.ts` validates evidence payload.
- `npm run check`, `npm test`, `npm run coverage`, `npm run verify:readme`, `npm run build` pass.
- Local web returns HTTP 200 and `/api/production` returns non-empty JSON with `evidence.ok`.
