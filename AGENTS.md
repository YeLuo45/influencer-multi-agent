# 多智能体跨平台大 V 全自动运营交付系统 — AGENTS.md

项目自身的工作规范（agent 协作 & dev 维护）。

## 项目目标

根据网上热点（trends/hot topics），通过多智能体流水线自动产出高质量内容，并以"大 V"身份跨平台发布，最终沉淀学习闭环。

## 结构

```
influencer-multi-agent/
├── packages/
│   ├── core/          # 状态机 + JSON 存储 + LLM 客户端 + agent 协议
│   ├── crawler/       # 多源抓取 (HTTP/Playwright/crawl4ai 抽象)
│   ├── browser-mcp/   # MCP server 暴露浏览器自动化能力
│   ├── publisher/     # 多平台 channel (X/小红书/微博/B站/Reddit)
│   └── cli/           # CLI + bootstrap demo
├── docs/              # 设计文档 + PRD + 技术方案
└── .ima/              # 运行时数据（content/<id>.json, sources/, drafts/）
```

## 开发规范

- TypeScript strict mode, strip-only（不要 enum/namespace/import =）
- 单测用 `node:test`，禁止 vitest/jest
- 状态机只能通过 `core/state-machine.ts` 转移
- agent 通信走 `core/protocol.ts` 的三态结果（ok/error/needs-input）
- 每个 package 有独立 tsconfig + package.json
- 提交格式：`feat|fix|docs(scope): description`

## 验收清单

1. `npm install && npm run build` 退出码 0
2. `npm test` 全部通过
3. `npm run bootstrap` 在 `.ima/` 留下至少 3 条 `done` 状态的 content
4. CLI `npm run cli -- status <id>` 能查回这条 content
5. 任意 package `dist/` 非空

## 状态机约束

- `intake → research` 自动触发 Research agent
- `review → publish` 仅在 review 通过时（`review.decision == "approve"`）才能走通
- 失败必须走 `needs_revision` → `draft` 而不是直接 `review`
- 跨状态跳转会被 state-machine 拒绝（InvalidTransition）

## 参考仓库

四个参考仓库的 README 已逐字分析，模式已记录到 `docs/architecture.md`。