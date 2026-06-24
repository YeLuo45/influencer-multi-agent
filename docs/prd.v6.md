# PRD v6 — Release Ops Full Automation Batch

## Background
boss 要求无人值守完成后续所有迭代方向。v4.7 已有 delivery evidence、safe-forward dry-run、JSONL history、webActions 和 CI summary parsing，但仍需要把 7 个方向合成一个 operator-ready 闭环。

## Goals
- G1: Release Ops Dashboard v2：把 evidence、failed queue、history、CI、push recovery 汇总成一屏状态。
- G2: Safe Forward Executor：在精确 confirmation 下生成可审计逐步执行计划，默认 dry-run。
- G3: Delivery History Ledger Compaction：保留最近记录，归档旧趋势和失败门禁统计。
- G4: CI Evidence Auto-Ingest：沿用 CI gate parsing 并进入 dashboard 汇总。
- G5: Production Runbook Automation：结构化 runbook 输出 precondition、commands、MCP forward 步骤。
- G6: Web Action Manifest UI：生产运营页直接渲染 action buttons，不只暴露 JSON。
- G7: Release Local Hardening：提供隔离 storage root、非递归 README verifier 和 release-local 命令链。

## Acceptance
- Core delivery evidence targeted tests cover all 7 directions.
- `/api/production` returns `releaseOpsDashboard`, `safeForwardExecution`, `structuredRunbook`, `compactedHistory`, and `releaseLocalHardening`.
- Web production tab renders visible action buttons backed by `webActions`.
- Full hard gates pass: check, test, coverage, verify:readme, build.
