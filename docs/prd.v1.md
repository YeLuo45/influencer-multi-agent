# PRD v1 — Influencer Multi-Agent

> 提案 ID: P-20260620-007
> 项目 ID: PRJ-20260620-002

## 一句话目标

**输入**: 一个主题 (e.g. "AI Agent 趋势")
**输出**: 一篇"大 V 级别"内容，自动分发到 N 个平台，并留下可审计的全过程记录。

## 目标用户

- 个人创作者 / 小团队运营
- 想做"全自动大 V"但不会写文案的非技术用户
- 已有内容能力、想批量放量的内容团队

## v0.1 必达功能（MUST）

1. **主题录入**：CLI `run <topic>` 启动一条 content
2. **自动研究 (Research)**：从至少 2 个 source 抓取（HTTP + Playwright 兜底），提炼 5-10 条 signals
3. **选题生成 (Ideas)**：从 signals 生成 3-5 个候选选题，每个含 hook + 目标平台 + score
4. **内容生成 (Draft)**：mock LLM 生成标题/正文/标签/封面建议
5. **审核 (Review)**：合规/去重/品牌一致性 4 项检查，至少 1 项不通过 → `needs_revision`
6. **跨平台发布 (Publish)**：5 个 channel (x/xiaohongshu/weibo/bilibili/reddit) 都执行 post，每个记录 post 状态
7. **审计 (Audit)**：发布完成后写入 insight 到 content.history
8. **状态机严格**：非法转移抛 InvalidTransition，CLI 必须显式错误
9. **持久化**：所有 content 写入 `.ima/content/<id>.json`，重启可继续
10. **Bootstrap demo**：`npm run bootstrap` 创建 3 个示例 content 走完整 pipeline

## 验收标准

```bash
npm install && npm run build  # exit 0
npm test                      # 全部通过
npm run bootstrap             # .ima/ 留下 3 条 done
npm run cli -- list           # 列出 3 条
```

## 非目标（v0.1 不做）

- 接真实 LLM（保留接口 + MockLlm 默认实现）
- 接真实社媒 API（5 个 channel 都是 deterministic stub）
- 多 persona / 多账号
- 评论自动回复 / 私信
- 内容 A/B 实验

## 风险

| 风险 | 缓解 |
|---|---|
| 真实 LLM 不可用 | 默认 MockLlm 跑通；env 切换到 OpenAI-compatible endpoint |
| 真实社媒 API 被封 | stub 接口契约冻结；切换真实实现不改 caller |
| crawler 被反爬 | 三后端 fallback (http → playwright → crawl4ai) |
| 内容审核漏网 | 4 项硬检查；任何一项 fail → needs_revision |

## 交付物

- GitHub repo: `YeLuo45/influencer-multi-agent`
- 5 个 npm workspaces 包
- docs/architecture.md + prd.v1.md + technical-solution.v1.md
- bootstrap demo + 至少 30 个单元测试