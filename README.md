# influencer-multi-agent

多智能体跨平台大 V 全自动运营交付系统：根据网上热点生成内容并跨平台发布。

## v0.4 新增（队列 + worker）

| 方向 | 实现 |
|---|---|
| **发布队列持久化** | `@ima/core/publish-queue.ts` `QueueItem` 状态机（pending/posting/posted/failed_retry/failed_dead）+ 指数退避；`AgentContext.queueSink` 注入；`PublishAgent` 写队列不阻塞；`@ima/cli/queue-store.ts` + `@ima/cli/queue-worker.ts` 持久化到 `.ima/queue/<id>.json`；`ima queue list/work/prune` + `npm run queue:work` |
| **修复** sink 失败不掩盖 publish 失败 | `PublishAgent` 用 `safeSink` 包裹，任何 sink 异常都被 swallow，post 错误继续上报 |

## v0.3 新增（F+G+H 方向）

| 方向 | 实现 |
|---|---|
| **F** 真实 LLM 接入 | `OpenAICompatibleLlm` 支持任意 OpenAI-compatible endpoint；支持 `provider/model` 自检、`temperature`、timeout、5xx/429/network retry；`.env.example` 给出配置模板 |
| **G** 平台差异化适配 | `@ima/core/platform-adapter.ts` 对 X/小红书/微博/B站/Reddit 执行长度、语气、tag、CTA 约束；`PublishAgent` 发帖前自动适配 |
| **H** 反馈窗口持久化 | `@ima/core/feedback-store.ts` 维护 `feedback.json`，`feedback` CLI 拉取 engagement 后按窗口过滤保存，下次启动同步注入 `Pipeline` 做 idea re-rank |
| **修复** 发布验收记录 | `Pipeline` 先写入 posts/schedule 再运行 Audit，history note 真实显示 `published N/N (failed 0)` |

## v0.2 新增（C+D+E 方向）

| 方向 | 实现 |
|---|---|
| **C** 内容效果回流 → 自动 re-rank ideas | `@ima/core/idea-ranker.ts` + `engagement-tracker.ts`；`Pipeline` 注入 `feedback: EngagementMetric[]`；`IdeaAgent` 历史表现好的 idea 自动加分 |
| **D** 多 persona 管理 | `@ima/core/persona.ts` Persona + PersonaRegistry；`Pipeline` 注入 `personaLookup`；`IdeaAgent` + `DraftAgent` prompt 注入 persona；CLI `ima persona list/show/add/remove` |
| **E** MCP server 改成 Streamable HTTP | `@ima/browser-mcp/src/http.ts` `McpHttpServer`；POST JSON-RPC + GET SSE + DELETE 204；`asHttpHandler` 桥接；`npm run mcp:http` 启动 |

## 架构

```
                    ┌────────────────────────────────────────────────┐
                    │                  @ima/cli                       │
                    │   run/list/status/step/doctor/persona/feedback   │
                    └─────────────────────┬──────────────────────────┘
                                          │
        ┌─────────────────────┬───────────┼─────────────┬──────────────────────┐
        │                     │           │             │                      │
┌───────▼────────┐   ┌─────────▼─────┐   ┌─▼──────────┐ ┌─▼────────────┐  ┌────▼───────────┐
│  @ima/core     │   │ @ima/crawler  │   │@ima/browser│ │@ima/publisher│  │ MCP clients    │
│                │   │               │   │    -mcp    │ │              │  │                │
│ state machine  │   │ HTTP+JS+crwl4 │   │  stdio +   │ │  5 channels  │  │ stdio JSON-RPC │
│ storage        │◄──┤  + composite  │◄──┤  Streamable│ │  + registry  │  │ Streamable HTTP│
│ LLM            │   │  fallback     │   │  HTTP MCP  │ │              │  │                │
│ 7 agents       │   │               │   │            │ │              │  │                │
│ persona        │   │               │   │            │ │              │  │                │
│ ranker         │   │               │   │            │ │              │  │                │
│ engagement     │   │               │   │            │ │              │  │                │
└────────────────┘   └───────────────┘   └────────────┘ └──────────────┘  └────────────────┘
```

## 状态机

```
intake ─► research ─► ideas ─► draft ─► review ─► publish ─► done
                          ▲                     │
                          └── needs_revision ◄──┘
```

## 命令（全部已验证可跑）

```bash
# 安装（WSL 若 NODE_ENV=production，必须 include dev，否则 tsx/typescript 不会安装）
npm install --include=dev --ignore-scripts --no-audit --no-fund

# 构建
npm run build

# 类型检查（5 包 tsc --noEmit）
npm run check

# 单测（node:test, 142/142 pass）
npm test

# Bootstrap demo — 3 条 content 跑完 pipeline（带 persona）
npm run bootstrap

# CLI 命令
npm run cli -- list                            # 列出所有 content
npm run cli -- status <id>                     # 查看单条 content JSON
npm run cli -- step <id>                       # 单步推进
npm run cli -- doctor                           # channel + crawler + engagement 健康检查
npm run cli -- persona list                     # 列出所有 persona
npm run cli -- persona show <id>                # 查看 persona 详情
npm run cli -- persona add <id> <name> [tone]   # 新增 persona
npm run cli -- persona remove <id>              # 删除 persona
npm run cli -- run <topic>                      # 创建并跑完一条 content
npm run cli -- run-with-persona <id> <topic>    # 用指定 persona 创建并跑
npm run cli -- feedback                         # 拉取所有 done content 的 engagement
npm run cli -- queue list                       # 查看 .ima/queue 中所有发布任务
npm run cli -- queue work [--limit N]           # 跑一次 publish worker（重试 due 项）
npm run cli -- queue prune                      # 清理 failed_dead
npm run queue:work                              # 同 queue work（可配 cron）

# 真实 LLM（可选；默认 MockLlm 零依赖）
cp .env.example .env
# 编辑 IMA_LLM_ENDPOINT / IMA_LLM_KEY / IMA_LLM_MODEL 后：
set -a; source .env; set +a
npm run cli -- doctor                           # 输出 llm provider/model

# MCP servers
npm run mcp:stdio                              # 启动 stdio MCP server (Chrome DevTools 风格)
npm run mcp:http                                # 启动 Streamable HTTP MCP server (默认 127.0.0.1:3000)

# 手动验证 HTTP MCP
curl -s http://127.0.0.1:3000/health | head
curl -s -X POST http://127.0.0.1:3000/mcp \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize"}' | head
```

## 7 类 agent

| Agent | 责任 | 输入 | 输出 |
|-------|------|------|------|
| Research | 抓热点（crawler + browser-mcp）| 主题/关键词 | sources, signals |
| Idea | 从热点生成 idea + 用 ranker 排序 | sources + feedback + persona | idea 列表 |
| Draft | 用 persona prompt 生成内容 | idea + persona | draft |
| Review | 合规/去重/品牌一致性 | draft | review 报告 |
| Schedule | 计算发布时机 | review_pass | schedule |
| Publish | 跨平台发布 | draft + schedule | post records |
| Audit | 监控效果 | post records | insight |

## Engagement 模型（C 方向）

每条 content 的 `engagement: EngagementMetric[]` 字段：
```ts
type EngagementMetric = {
  platform: PlatformId;
  postId: string;
  likes: number;
  comments: number;
  shares: number;
  views: number;
  fetchedAt: string;
};
```

`IdeaRanker.rank(ideas, feedback, ideaAngleFor)` 根据历史 performance 加成历史高分 idea。

`feedback.json` 持久化结构：
```ts
type FeedbackState = {
  records: EngagementMetric[];
  windowDays: number;
  lastUpdated: string;
  totalRecords: number;
};
```

## Persona 模型（D 方向）

```ts
type Persona = {
  id: string;            // e.g. 'tech-insight'
  name: string;          // e.g. '技术洞察家'
  tone: string;          // e.g. 'analytical + concise'
  targetAudience: string;
  signaturePhrases: string[];
  bannedWords: string[];
  defaultPlatforms: PlatformId[];
  examples: string[];
};
```

内置 3 个 persona：`default` / `tech-insight` / `lifestyle`。

## HTTP MCP（E 方向）

- `POST /mcp` — JSON-RPC 请求，返回 JSON 或 SSE
- `GET /mcp` — 打开 SSE 长连接（heartbeat 15s）
- `DELETE /mcp` — 关闭 session (204)
- `GET /health` — 健康检查

## Platform Adapter（G 方向）

| 平台 | 约束 |
|---|---|
| X | 280 字以内，最多 3 tags，hook-first |
| 小红书 | 1000 字以内，emoji + 姐妹们口吻，最多 5 tags |
| 微博 | 2000 字以内，标题首行 + inline hashtags |
| B站 | 5000 字以内，三段式：标题/核心观点/互动 |
| Reddit | 40000 字以内，长文讨论导向，CTA `What do you think?` |

## 测试覆盖（v0.3）

- **142/142 tests pass（100%）**
- core: 106 tests（新增 publish-queue × 19、publish-agent × 5、protocol 字段、pipeline 行为兼容）
- crawler: 9 tests
- publisher: 9 tests
- cli: 18 tests（新增 queue-store + PublishWorker + summarizeQueue × 8、savePersonas × 1）
- browser-mcp: 13 tests（http MCP server 全场景）

## 最新验收（2026-06-21）

| 命令 | 结果 |
|---|---|
| `npm test` | 142/142 pass（core 106 / crawler 9 / publisher 9 / cli 18） |
| `npm run check` | 5 packages `tsc --noEmit` pass |
| `npm run build` | 5 packages build pass |
| `npm run bootstrap` | fresh `.ima/` 生成 3 条 `done` content，posts=3/1/2 |
| `npm run cli -- status <id>` | 可查回 `"stage": "done"` 与 `published 3/3 (failed 0)` |
| `npm run cli -- queue list` | 列 6 个 queue item，全部 `posted` |
| `npm run queue:work` | 跑 0（无 due），no-op |
| `node --import tsx packages/cli/src/queue-smoke.ts` | 模拟 503 → retry 1次 → due 后成功 posted，端到端验证 |
| `packages/*/dist` | browser-mcp 24、cli 12、core 84、crawler 12、publisher 12 files |

## 参考

| 参考仓库 | 借鉴模式 |
|---|---|
| [YeLuo45/pi-mono](https://github.com/YeLuo45/pi-mono) | npm workspaces 5 包 + 严格 TS |
| [Panniantong/Agent-Reach](https://github.com/Panniantong/Agent-Reach) | 多 channel 抽象 + doctor 自检 |
| [YeLuo45/chrome-devtools-mcp](https://github.com/YeLuo45/chrome-devtools-mcp) | MCP server 6 tools + stdio |
| [YeLuo45/crawl4ai](https://github.com/YeLuo45/crawl4ai) | LLM-friendly markdown 抓取 |

## License

MIT