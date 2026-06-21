# Influencer Multi-Agent — Architecture

## 0. 目标

构建一个可"全自动"运营的多智能体系统：输入主题 → 输出"大 V 级别"内容并跨平台分发。

## 1. 4 个参考仓库 → 设计选择

| 参考仓库 | 借鉴模式 | 落地 |
|---|---|---|
| `YeLuo45/pi-mono` (branch: influencer-multi-agent) | npm workspaces monorepo, packages 分层 (ai/agent/coding-agent/tui), strip-only TS, biome+tsgo check | 我们用 5-package monorepo: core/crawler/browser-mcp/publisher/cli；TypeScript strict + `tsc --noEmit` 做 check |
| `Panniantong/Agent-Reach` | 多 channel 抽象 (Twitter/Reddit/XHS/B站), cookie/config, doctor 自检命令, MCP integration | `@ima/publisher` 同款 channel 抽象；`@ima/cli` 提供 `doctor` 命令体检每个 channel |
| `YeLuo45/chrome-devtools-mcp` | MCP server 结构 (McpContext/Page/ToolHandler), 浏览器自动化 via Puppeteer, 严格 TS（no any/no as）| `@ima/browser-mcp` 用 Playwright 实现 MCP server，agent 通过 MCP 调用浏览器抓取需要 JS 渲染的页面 |
| `YeLuo45/crawl4ai` | HTTP+Playwright 双轨抓取, 输出 LLM-friendly markdown, 反爬策略 (stealth/fake-ua) | `@ima/crawler` 三后端 (http/playwright/crawl4ai-bridge)，自动选最快路径 |

## 2. 数据模型

`content`（一条大 V 内容主记录）：
```ts
type ContentStage = 'intake' | 'research' | 'ideas' | 'draft' | 'review' | 'publish' | 'done' | 'needs_revision';
type Content = {
  id: string;             // c-<uuid>
  topic: string;
  stage: ContentStage;
  persona: string;        // 大 V 人设
  sources: Source[];      // research 产出
  ideas: Idea[];          // ideas 产出
  draft: Draft | null;
  review: Review | null;
  schedule: Schedule | null;
  posts: PostRecord[];
  history: HistoryEntry[];
  createdAt: string;
  updatedAt: string;
};
```

`source`（research 阶段抓取的原始材料）：
```ts
type Source = { url: string; title: string; snippet: string; fetchedAt: string; signals: string[] };
```

`idea`（一个候选选题）：
```ts
type Idea = { id: string; angle: string; hook: string; targetPlatform: PlatformId[]; score: number };
```

`draft`：
```ts
type Draft = { title: string; body: string; tags: string[]; coverHint: string; cta: string; platformOverrides: Partial<Record<PlatformId, string>> };
```

`review`：
```ts
type Review = { decision: 'approve' | 'reject' | 'revise'; reasons: string[]; checks: { name: string; pass: boolean; note: string }[] };
```

`post`：
```ts
type PostRecord = { platform: PlatformId; postId: string | null; status: 'queued' | 'posted' | 'failed'; url?: string; error?: string; postedAt?: string };
```

## 3. 状态机（7 stage + needs_revision）

```
intake ──► research ──► ideas ──► draft ──► review ──► publish ──► done
                          ▲                     │
                          └── needs_revision ◄──┘
```

### 转移表

| from | to | 触发者 | 校验 |
|---|---|---|---|
| intake | research | user / cron | topic 非空 |
| research | ideas | research agent | sources 至少 1 条 |
| ideas | draft | idea agent | ideas 至少 1 条 |
| draft | review | draft agent | draft.title/body 非空 |
| review | publish | review agent | review.decision === 'approve' |
| review | needs_revision | review agent | review.decision !== 'approve' |
| needs_revision | draft | revise trigger | 上次失败 < 3 次 |
| publish | done | publish agent | 所有 planned posts resolved |
| publish | needs_revision | publish agent | 平台级重试超限 |

任何非法转移抛 `InvalidTransition`。

## 4. agent 协议

```ts
type AgentResult<T> =
  | { kind: 'ok'; data: T }
  | { kind: 'error'; message: string; recoverable: boolean }
  | { kind: 'needs-input'; question: string; options?: string[] };

interface Agent<TIn, TOut> {
  name: string;
  run(input: TIn, ctx: AgentContext): Promise<AgentResult<TOut>>;
}
```

agent 都是 stub + mock-LLM 实现（参考 `mock-llm-context-priority` 模式），无需 API key 即可跑通；真实 LLM 通过 `@ima/core/llm` 注入。

## 5. 存储

- 全部 JSON 文件在 `.ima/` 下（`find ./` 即可审计）
- `.ima/content/<id>.json` — 单条 content
- `.ima/index.json` — id → {topic, stage, updatedAt} 索引（加速 list）
- `.ima/published/<contentId>.json` — 发布快照
- 不引入 SQLite/Redis，遵循"artifact graph as only durable surface"

## 6. LLM 客户端

`@ima/core/llm.ts` 暴露 `complete(prompt, opts)`：
- `MockLlm` — 默认实现，按关键词返回 plausible 内容（无 key）
- `OpenAICompatibleLlm` — 接任意 OpenAI-compatible 端点（OpenAI / CRS / DeepSeek / proxy 均可）
- env 变量 `IMA_LLM_ENDPOINT`, `IMA_LLM_KEY`, `IMA_LLM_MODEL` 切换
- `complete()` 支持 `system`, `maxTokens`, `temperature`
- timeout 默认 30s；5xx/429/network/AbortError 自动指数退避重试
- `provider/model` 暴露给 CLI `doctor`，便于确认当前真实模型

## 7. publisher channels

```ts
interface Channel {
  id: PlatformId;
  search(query: string): Promise<Source[]>;
  read(url: string): Promise<Source>;
  post(draft: Draft, opts: PostOptions): Promise<PostRecord>;
  healthCheck(): Promise<{ ok: boolean; detail: string }>;
}
```

实现 5 个 stub channel（`x`, `xiaohongshu`, `weibo`, `bilibili`, `reddit`）。每个 stub 默认返回 deterministic plausible result，方便 e2e。

## 8. browser-mcp

暴露 6 个 MCP tools（参考 chrome-devtools-mcp 的最小集）：
- `navigate(url)` — 跳转
- `snapshot()` — 返回 accessibility tree 文本
- `extract_text(selector)` — CSS 选择器提取
- `click(ref)` — 点击元素
- `wait_for(condition)` — 等待文本/选择器
- `close()` — 关闭浏览器

agent 用 MCP 协议调 `@ima/browser-mcp` 抓需要 JS 渲染的页面（如小红书首页）。

## 9. crawler 三后端

`@ima/crawler` 自动选：
1. `http` — 静态 HTML，纯 fetch
2. `playwright` — JS 渲染页
3. `crawl4ai` — 调用 Python 子进程（可选，自带 docker）

路由策略：先 `http`，失败 → `playwright`，失败 → `crawl4ai`。

## 9. HTTP MCP transport（v0.2 新增）

`@ima/browser-mcp/src/http.ts` `McpHttpServer` 暴露 Streamable HTTP transport：
- `POST /mcp` — JSON-RPC 请求，返回 JSON（或 SSE 如果 Accept 含 `text/event-stream`）
- `GET /mcp` — 打开 SSE 长连接（heartbeat 15s, session-max-age 5min）
- `DELETE /mcp` — 关闭 session (204)
- `GET /health` — 健康检查

`asHttpHandler(server)` 桥接 stdio `McpServer` → HTTP handler。`startHttpServer(server, opts)` 完整引导。
CLI 命令 `npm run mcp:http` 启动 HTTP server（默认 `127.0.0.1:3000`），`npm run mcp:stdio` 启动 stdio server。

## 10. engagement + idea ranker（v0.2 新增）

`@ima/core/engagement.ts` 定义 `EngagementMetric` + `deriveScore` + `aggregate`。
`@ima/core/idea-ranker.ts` `IdeaRanker.rank(ideas, feedback, ideaAngleFor)`：根据历史 engagement 加成高分 idea。
`@ima/core/engagement-tracker.ts` `MockEngagementTracker` + `CompositeEngagementTracker` + `createEngagementTracker()`。
`Pipeline` 注入 `feedback: EngagementMetric[]`，在 ideas 阶段让 IdeaAgent 应用 ranker。
CLI `npm run cli -- feedback` 拉取所有 done content 的 engagement 写入 storage。
v0.3 起 engagement 会持久化到 `.ima/feedback.json`：
```ts
type FeedbackState = {
  records: EngagementMetric[];
  windowDays: number;
  lastUpdated: string;
  totalRecords: number;
};
```
`createApp()` 启动时同步读取该文件并按窗口过滤，作为 `Pipeline.feedback` 注入到 IdeaAgent。

## 11. persona management（v0.2 新增）

`@ima/core/persona.ts` 定义 `Persona` + `PersonaRegistry` + `applyPersonaToPrompt(persona, prompt)`。
`Pipeline` 注入 `personaLookup(id)`，在 ideas / draft 阶段让 agent 把 persona 信息加入 prompt。
CLI 命令：
- `ima persona list`
- `ima persona show <id>`
- `ima persona add <id> <name> [tone]`
- `ima persona remove <id>`
内置 3 个 persona：`default` / `tech-insight` / `lifestyle`。

## 12. publish queue（v0.4 新增）

`@ima/core/publish-queue.ts` 是状态机 + 纯函数层；`@ima/cli/queue-store.ts` 持久化到 `.ima/queue/<id>.json`；`@ima/cli/queue-worker.ts` 周期拉快照 + 调 `processQueue` 重试 due 项。

## 12.5 multi-locale translate (v0.5 新增)

`TranslateAgent` 在 draft 和 review 之间调用 `translateContent(llm, { sourceBody, sourceLocale: 'zh', targets })`。结果落到 `Draft.translations`（按 locale 索引），同时按 `PLATFORM_LOCALE` 写 `platformOverrides[platform] = entry.body`，使 `PublishAgent` 在 deriveTargets 阶段拿到正确的本地化 body。

关键约束：
- 三个 locale：`zh` / `en` / `ja`（`SUPPORTED_LOCALES`）
- `MockLlm` 已有 `translate to english` / `translate to japanese` 关键词路由；真实 LLM 由 prompt 驱动
- LLM 失败或 body 为空 → fallback 到 source body 并记录在 `TranslationResult.fellBackToSource`
- `PLATFORM_LOCALE`: x/reddit → en; xiaohongshu/weibo/bilibili → zh

## 12.6 A/B testing（v0.5 新增）

`ab-test.ts` 提供：
- `assignVariantTags(items, variantCount)`：round-robin 分配 A/B/C/D/E tag
- `aggregateByVariant(posts, metrics)`：按 variant 聚合 engagement（`c*3 + s*2 + l + 0.05*v` 加权 score）
- `selectWinner(variants, { minSampleSize, tieMargin })`：选胜出方，少于 minSampleSize 或 tie 内返回 null
- `buildAbReport(contentId, posts, metrics, opts)`：完整报告

数据流：
1. `Pipeline({ variantCount: 2 })` → `IdeaAgent` 给每条 idea 加 `variantTag: 'A'|'B'`
2. `PublishAgent.deriveTargets` 把 idea 的 tag 透传到 `PostRecord.variantTag`
3. `feedback` CLI 拉取 metrics 时如果源 post 已有 tag，metrics 继承
4. `ima ab report <id>` 调用 `buildAbReport` 输出表格 + winner

## 12.7 web console（v0.5 新增）

`apps/web/`（零 build）：纯 HTML + CSS + 原生 JS。CLI 启动 `web-server.ts` Node stdlib HTTP server：

```
GET  /                apps/web/index.html
GET  /style.css        apps/web/style.css
GET  /app.js           apps/web/app.js
GET  /api/contents     Content summary list
GET  /api/queue        { summary, items } for .ima/queue
GET  /api/feedback     window-filtered feedback summary
GET  /api/ab?id=...    AbReport
```

约束：
- `types: []` 在 tsconfig.base.json 排除了原生 @types/node；`types/node-globals.d.ts` 提供 `http/fs/path/url` 的最小 stub（声明 function signature，runtime 仍用 node 自带）
- web 静态目录路径：`web-server.ts` 在 `packages/cli/src/`，相对路径 `../../../../apps/web` 才能到 monorepo 根
- 端口 0 时 server 报告真实 chosen port（用 `server.address()`）

`QueueItem` 状态机：
```
pending ─► posting ─► posted           (terminal success)
                ├─► failed_retry ─► posting   (next due after backoff)
                └─► failed_dead              (max attempts exceeded)
```

关键约束：
- `AgentContext.queueSink` 可选；不存在时 `PublishAgent` 行为与 v0.3 完全一致（向后兼容）。
- `safeSink` 包裹任何 sink 调用，sink 抛错不掩盖 publish 失败。
- 指数退避 `baseDelayMs * 3^(attempts-1)`，封顶 1 小时。
- 默认 `maxAttempts = 3`，可在 enqueue 时覆盖。
- worker 纯函数：`processQueue(items, resolver, opts)` 输入快照返回更新后的 items + summary，调用方负责持久化。

CLI 命令：
- `ima queue list` — 列所有 item + 状态/平台/attempts
- `ima queue work [--limit N]` — 跑一次 worker，处理 due 项
- `ima queue prune` — 删 `failed_dead`
- `npm run queue:work` — 同 `queue work`（可配 cron）

## 13. platform adapter（v0.3 新增）

`@ima/core/platform-adapter.ts` 是纯函数层，`PublishAgent` 发帖前统一调用：
- X：280 字以内，最多 3 tags
- 小红书：1000 字以内，emoji-rich + `姐妹们` 口吻，最多 5 tags
- 微博：2000 字以内，标题首行 + inline hashtags
- B站：5000 字以内，三段式：标题 / 核心观点 / 互动
- Reddit：40000 字以内，长文讨论导向，CTA `What do you think?`

发布阶段顺序约束：先写入 `posts/schedule` 到临时 content，再运行 `AuditAgent`。否则 Audit 会看到空 posts，history note 会错误显示 `published 0/0`。

## 13. test pyramid

- `@ima/core/test/` — 106 tests（state-machine × 7, storage × 4, llm × 4, llm-openai × 13, pipeline × 6, publish-agent × 5, engagement × 5, feedback-store × 9, platform-adapter × 11, publish-queue × 19, idea-ranker × 7, engagement-tracker × 7, persona × 9）
- `@ima/crawler/test/` — 9 tests
- `@ima/publisher/test/` — 9 tests
- `@ima/cli/test/` — 18 tests（queue-store + PublishWorker + summarizeQueue × 8, savePersonas × 1, runtime hooks）
- `@ima/browser-mcp/test/` — 13 tests（http MCP server 全场景）
- `scripts/e2e-bootstrap.test.ts` — 端到端跑通 1 条 content

## 14. 不做什么（v0.4 边界）

- 不接真实社媒 API（5 个 channel 都是 deterministic stub）
- 不做实时评论自动回复（v0.6+）
- 不做自动 A/B 实验（v0.6+）

## 15. 后续迭代方向（v0.6+）

1. **真实 channel 接入** — X/Twitter API + XHS web 登录态
2. **评论自动回复** — AuditAgent 周期性抓 `engagement.comments[]`，让 DraftAgent 生成 ≤140 字回复（适配 X/微博）
3. **scheduler worker** — 取代 publish 阶段同步 post，发布时机由 worker 异步处理
4. **per-content concurrency guard** — 同一 content 的多 platform worker 跑在并行任务上（`Promise.all`）
5. **Web UI 多语言切换** — 同步 i18n 框架，让 zh/en 切换不只改 `document.documentElement.lang`
6. **Web UI 实时推送** — `EventSource` 订阅 `.ima/queue/` 变更，dashboard 自动刷新
7. **Per-channel rate limiting** — 真实 channel 接入后，worker 按 platform 节流
8. **LLM token budget tracking** — `feedback-store` 扩 token 字段，按日聚合
9. **A/B 显著性检验** — 给 `selectWinner` 加 z-test / chi-square
10. **E2E test harness** — 在 CI 跑 `bootstrap` + `feedback` + `ab report` 端到端

## 16. 决策日志（v0.4 - v0.5）

- v0.4 publish queue：选状态机 + 指数退避 + worker 纯函数（input snapshot → output items），由 CLI 端 `QueueStore` 持久化；agent 不知道有盘文件存在。
- v0.4 sink 失败隔离：PublishAgent 用 `safeSink` 包裹任何 sink 异常，post 失败仍按原路径上报。
- v0.5 translate：选 `core/src/translate.ts` 纯函数层 + agent shell，保持 Agent 接口纯。
- v0.5 A/B：选 `variantCount` 选项 + round-robin 分配 + `PLATFORM_LOCALE` 透传，避免新增 agent。
- v0.5 web：选 `apps/web/` 零 build + Node stdlib HTTP server，不引 vite/react，规避 WSL 离线 + 拖慢 build 风险。
- v0.5 web 路由：`web-server.ts` 用 `import.meta.url` + `path.resolve` 解析 `apps/web/`，3 个 `..` 跳到 monorepo 根。
- v0.5 web 类型：项目 `types: []` 排除原生 @types/node；用 `types/node-globals.d.ts` 补 `http/fs/path/url` 最小 stub（仅声明类型签名，runtime 仍用 node 自带）。