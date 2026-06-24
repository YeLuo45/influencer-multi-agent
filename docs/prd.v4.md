# PRD v4 — Delivery Automation Full Loop

## Background
v3.6 已提供 delivery evidence 与 safe-forward plan，但无人值守模式还需要完整执行闭环：历史趋势、CLI dry-run/执行入口、runbook、Web action payload、CI evidence 合并和下一轮推荐。

## Goals
- G1: 记录 delivery evidence history snapshot，支持趋势和 failed gate Top。
- G2: 提供 `ima delivery safe-forward --proposal P-...`，默认 dry-run，显式确认后才可执行。
- G3: 提供 `ima delivery runbook --proposal P-...`，输出 copy-ready 生产 runbook。
- G4: `/api/production` 暴露 history/safeForwardCommand/runbook/recommendations，Web 主界面可见。
- G5: 支持 CI gate 合并，远端失败不能被本地绿覆盖。
- G6: 根据失败门禁、diff ownership、coverage weak spots 推荐下一轮方向。

## Acceptance
- `node --test --import tsx packages/core/test/delivery-evidence.test.ts` passes with new 10-test coverage.
- `node --test --import tsx packages/cli/test/v12-cli.test.ts packages/cli/test/web-server-production.test.ts` passes.
- `npm run verify:readme` executes delivery safe-forward and runbook commands.
- Full gates pass: check, test, coverage, verify:readme, build.
- Local web `/api/production` returns `history`, `safeForwardCommand`, `runbook`, and `recommendations`.
