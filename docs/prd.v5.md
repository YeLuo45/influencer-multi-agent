# PRD v5 — Push Recovery + Executable Delivery Actions

## Background
v4.2 已完成 delivery automation full loop，但实际无人值守交付暴露出两个运营缺口：GitHub push 可能临时失败，以及 Web/CLI action 仍缺更明确的执行与持久化模型。

## Goals
- G1: 提供 push recovery plan，识别 local/remote commit 不一致并给出恢复命令。
- G2: safe-forward execute mode 必须由精确 confirmation token 解锁，默认 dry-run。
- G3: delivery history 支持 JSONL 持久化读写。
- G4: `/api/production` 和 Web 输出 action manifest，包含 copy runbook、copy MCP commands、download markdown。
- G5: CI run summary 可转换为 delivery gates，与本地 evidence 合并。

## Acceptance
- `node --test --import tsx packages/core/test/delivery-evidence.test.ts` passes with 15 tests.
- CLI/Web production targeted tests pass and expose `webActions`.
- Full hard gates pass: check, test, coverage, verify:readme, build.
- Local web `/api/production` returns `webActions.primaryActionId=copy-mcp-commands`.
