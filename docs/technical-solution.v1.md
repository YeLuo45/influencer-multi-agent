# Technical Solution v1

> 对应 PRD v1 的工程实现方案

## 1. 技术栈

| 层 | 技术 | 理由 |
|---|---|---|
| 运行时 | Node.js 20+ | pi-mono 同生态；用户已有 |
| 语言 | TypeScript 5.6 (strict + strip-only) | pi-mono 模式 |
| 单测 | `node:test` | 零依赖；用户偏好 |
| 包管理 | npm workspaces | 与 pi-mono 一致 |
| 持久化 | JSON files | artifact-graph 模式，无需迁移成本 |
| LLM | MockLlm 默认 + OpenAI-compatible 注入 | 默认无 key 跑通 |
| 浏览器自动化 | Playwright（chromium）| JS 渲染页抓取 |
| MCP | 自实现 stdio JSON-RPC | 与 chrome-devtools-mcp 同协议 |

## 2. 目录结构

```
influencer-multi-agent/
├── package.json                 # workspaces root
├── tsconfig.base.json
├── README.md / README.zh-CN.md / AGENTS.md
├── docs/
│   ├── architecture.md
│   ├── prd.v1.md
│   └── technical-solution.v1.md
├── packages/
│   ├── core/                   # 状态机 + storage + LLM + agent 协议
│   ├── crawler/                # http/playwright/crawl4ai 三后端
│   ├── browser-mcp/            # MCP server (Playwright + 6 tools)
│   ├── publisher/              # 5 个 channel stub
│   └── cli/                    # CLI + bootstrap-demo
└── .ima/                       # runtime data (gitignored)
```

## 3. 核心包 `@ima/core` 设计

### 3.1 state-machine.ts

```ts
const TRANSITIONS: Record<ContentStage, ContentStage[]> = {
  intake: ['research'],
  research: ['ideas'],
  ideas: ['draft'],
  draft: ['review'],
  review: ['publish', 'needs_revision'],
  needs_revision: ['draft'],
  publish: ['done', 'needs_revision'],
  done: [],
};
export function canTransition(from: ContentStage, to: ContentStage): boolean;
export function assertTransition(from: ContentStage, to: ContentStage): void;
```

### 3.2 storage.ts

```ts
export class JsonStore {
  constructor(private readonly root: string) {}
  async read<T>(path: string): Promise<T>;
  async write<T>(path: string, data: T): Promise<void>;
  async list(dir: string): Promise<string[]>;
}
```

`walk-up` 找到 monorepo root（与 reference `project-bootstrap-from-references` 同模式）。

### 3.3 llm.ts

```ts
export interface Llm {
  complete(prompt: string, opts?: { system?: string; maxTokens?: number }): Promise<string>;
}
export class MockLlm implements Llm { /* keyword-driven deterministic */ }
export class OpenAICompatibleLlm implements Llm { /* fetch to endpoint */ }
export function createLlm(): Llm { /* env-based */ }
```

### 3.4 protocol.ts

```ts
export type AgentResult<T> =
  | { kind: 'ok'; data: T }
  | { kind: 'error'; message: string; recoverable: boolean }
  | { kind: 'needs-input'; question: string; options?: string[] };

export interface Agent<I, O> { name: string; run(input: I, ctx: AgentContext): Promise<AgentResult<O>>; }
```

### 3.5 types.ts

定义 `Content`, `Source`, `Idea`, `Draft`, `Review`, `Schedule`, `PostRecord`, `PlatformId` 等。

### 3.6 agents/

7 个 agent 类（research/idea/draft/review/schedule/publish/audit），都接受 `AgentContext { llm, storage, crawler, publisher }`，返回 `AgentResult<...>`。

### 3.7 pipeline.ts

```ts
export class Pipeline {
  constructor(private readonly ctx: AgentContext) {}
  async step(content: Content): Promise<ContentStage>;  // 单步
  async run(content: Content): Promise<Content>;        // 全自动跑到 done 或 needs_revision
}
```

## 4. `@ima/crawler`

```ts
export interface Crawler {
  fetch(url: string, opts?: { render?: 'static' | 'js' }): Promise<{ html: string; markdown: string }>;
}
export class HttpCrawler implements Crawler;          // fetch + cheerio-like (内置 regex strip)
export class PlaywrightCrawler implements Crawler;     // 调用 MCP client
export class Crawl4aiCrawler implements Crawler;       // 调 Python 子进程 (可选)
export function createCrawler(opts: { prefer?: CrawlerBackend }): Crawler;
```

`CompositeCrawler` 自动 fallback。

## 5. `@ima/browser-mcp`

实现 stdio JSON-RPC server，方法：
- `tools/list` → 6 个 tool
- `tools/call` name ∈ {navigate, snapshot, extract_text, click, wait_for, close}

实现 ≤ 200 行（subagent-friendly 紧凑模式）。

## 6. `@ima/publisher`

5 个 channel：
- `xChannel` — X / Twitter
- `xiaohongshuChannel` — 小红书
- `weiboChannel` — 微博
- `bilibiliChannel` — B 站动态
- `redditChannel` — Reddit

每个 channel ≤ 80 行 stub 实现。所有 channel 用 `Registry` 注册：`registry.get('x')` 返回 channel 实例。

## 7. `@ima/cli`

子命令：
- `run <topic>` — 创建 content，启动 pipeline
- `list` — 列出所有 content
- `status <id>` — 单条详情
- `step <id>` — 单步推进
- `doctor` — channel/crawler 健康检查
- `bootstrap` — 创建 3 条示例

`bootstrap-demo.ts` 在 `npm run bootstrap` 时跑 3 个主题（"AI Agent 趋势"、"小红书种草心得"、"B站科技区爆款规律"），全跑通。

## 8. 测试

每个 core 包 ≥ 8 个 state-machine test + ≥ 5 个 storage test。
publisher ≥ 5 个 channel contract test。
crawler ≥ 3 个 routing test。
e2e ≥ 1 个 bootstrap 跑通 3 条 content。

目标 ≥ 30 tests / 100% pass。

## 9. CI / 部署

- TypeScript build = tsc emit dist/
- GitHub Actions: install → build → test
- 不部署到 GitHub Pages（CLI + Node 库，无 UI）

## 10. 开发次序

1. core (types + state-machine + storage + LLM) ← 必须先
2. agents stub
3. crawler (http fallback)
4. publisher 5 channel stub
5. pipeline
6. cli
7. browser-mcp (独立；可用则优化 crawler)
8. tests + bootstrap demo

## 11. 不引入

- vitest/jest（用 node:test）
- biome/eslint（用 tsc --noEmit 做 check）
- 任何 ORM / DB
- 任何状态管理库
- 任何 UI 框架

严格保持"零新增非必要依赖"。