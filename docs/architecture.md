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
- `OpenAICompatibleLlm` — 接任意 OpenAI 协议端点（含 Anthropic-OpenAI-proxy）
- env 变量 `IMA_LLM_ENDPOINT`, `IMA_LLM_KEY`, `IMA_LLM_MODEL` 切换

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

## 11. persona management（v0.2 新增）

`@ima/core/persona.ts` 定义 `Persona` + `PersonaRegistry` + `applyPersonaToPrompt(persona, prompt)`。
`Pipeline` 注入 `personaLookup(id)`，在 ideas / draft 阶段让 agent 把 persona 信息加入 prompt。
CLI 命令：
- `ima persona list`
- `ima persona show <id>`
- `ima persona add <id> <name> [tone]`
- `ima persona remove <id>`
内置 3 个 persona：`default` / `tech-insight` / `lifestyle`。

## 12. test pyramid

- `@ima/core/test/` — 48 tests（state-machine × 7, storage × 4, llm × 4, pipeline × 5, engagement × 5, idea-ranker × 7, engagement-tracker × 7, persona × 9）
- `@ima/crawler/test/` — 9 tests
- `@ima/publisher/test/` — 9 tests
- `@ima/browser-mcp/test/` — 13 tests（http MCP server 全场景）
- `scripts/e2e-bootstrap.test.ts` — 端到端跑通 1 条 content

## 13. 不做什么（v0.2 边界）

- 不接真实 LLM API（保留接口 + MockLlm 默认实现）
- 不接真实社媒 API（5 个 channel 都是 deterministic stub）
- 不做实时评论自动回复（v0.3+）
- 不做自动 A/B 实验（v0.3+）

## 14. 后续迭代方向（v0.3+）

1. **真实 LLM 接入** — CRS API 已验证可用，env 切换 OpenAI-compatible endpoint
2. **真实 channel 接入** — X/Twitter API + XHS web 登录态
3. **自动 re-rank 闭环** — `feedback` → ranker → 下次 idea 生成
4. **多语言** — 中/英/日自动翻译
5. **评论自动回复** — agent 检测评论并自动互动
6. **Web UI** — Vite + React 控制面板，调用 HTTP MCP server