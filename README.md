# influencer-multi-agent

多智能体跨平台大 V 全自动运营交付系统：根据网上热点生成内容并跨平台发布。

## v0.6 新增（DX 打磨：1+2+3+4+5 五个方向）

| 方向 | 实现 |
|---|---|
| **1. cli/web 脚本无 `--` 写法** | 新增 `packages/cli/src/cli-bin.ts` wrapper；`readNpmPassthroughArgs()` 解析 `npm_config_argv`，按 `NPM_SCRIPT_TO_CMD` 映射恢复 subcommand（`web`/`queue`/`queue:work`/`mcp:http`/`mcp:stdio`）；`parseWebOptions` 优先级 `--port N` > argv[1] > `npm_config_port`。`npm run cli list`、`npm run web 7777` 都可用 |
| **2. 锁定 npm ≥ 10** | `package.json` `engines.npm: ">=10.0.0"`；当前 npm 10.8.2 满足；旧 npm 会 npm warn 但不阻断 |
| **3. 完整 Chromium unsafe port 黑名单** | `parseWebOptions` 黑名单扩到 69 个端口（包含 1, 7, 9, 11, 13, 15, 17, 19, 20, 21, 22, 23, 25, 37, 42, 43, 53, 69, 77, 79, 87, 95, 101-104, 109-119, 123, 135, 137, 139, 143, 161, 179, 389, 427, 465, 512-515, 526, 530-532, 540, 548, 554, 556, 563, 587, 601, 636, 989-995, 1719-1723, 2049, 3659, 4045, 5060-5061, 6000, 6566, 6665-6669, 6679, 6697, 10080）；启动时 fail-fast 提示 `use 6677 or 7777 instead` |
| **4. web 启动后自动打开浏览器** | 新增 `openBrowser(url, opts)` 跨平台 spawn（mac=`open`、linux=`xdg-open`、win=`cmd /c start`）；spawn 失败容错（headless 服务器/无 DISPLAY 不报错）；web 命令新增 `--no-open` flag 关闭自动开 |
| **5. 共享 `Env` 类型** | 新增 `types/env.d.ts` 模块化 `Env extends Record<string, string \| undefined>`；`node-globals.d.ts` 补 `node:child_process` ambient（项目用 `types: []`，无法直接用 `@types/node`）；cli `index.ts` 用本地 `Env` alias 保持 tsconfig 零侵入 |

## v0.5 新增（1+2+3 三个方向）

| 方向 | 实现 |
|---|---|
| **多语言自动翻译** | `core/src/translate.ts` 纯函数层（zh / en / ja + parseTranslation + selectForLocale）；`TranslateAgent` 接到 Pipeline 的 `draft → review` 之间；`Draft.translations` 字段 + `platformOverrides` 按 `PLATFORM_LOCALE` 自动分配；CLI bootstrap 默认 `translateTargets: ['en', 'ja']` |
| **A/B 实验闭环** | `core/src/ab-test.ts` `AbReport` / `assignVariantTags` / `aggregateByVariant` / `selectWinner`；`Idea.variantTag` + `PostRecord.variantTag` + `EngagementMetric.variantTag`；`Pipeline.variantCount` 接入 IdeaAgent；`PublishAgent.deriveTargets` 把 tag 透传到 posts；CLI `ima ab report <id> [--min-samples N]` + `ima run-ab <N> <topic>` |
| **Web 控制面板** | `apps/web/` 纯静态（HTML + CSS + 原生 JS，零 build）；`@ima/cli/web-server.ts` Node stdlib HTTP 同时提供静态 + `/api/contents/queue/feedback/ab` JSON；CLI `npm run web` / `ima web --port N` 启动；`types/node-globals.d.ts` 补 `http/fs/path/url` 最小 stub（项目用 `types: []`） |

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
# 安装（WSL 若 NODE_ENV=production，必须 include dev，否则 tsx/typescript 不会安装；
# 同时要求 npm >= 10，否则 -- 后的参数会被 npm 吞掉）
npm install --include=dev --ignore-scripts --no-audit --no-fund

# 构建
npm run build

# 类型检查（5 包 tsc --noEmit）
npm run check

# 单测（node:test, 226/226 pass）
npm test

# 覆盖率门禁（c8，阈值 ≥95% lines/statements、≥85% functions、≥75% branches）
npm run coverage

# Bootstrap demo — 3 条 content 跑完 pipeline（带 persona）
npm run bootstrap

# CLI 命令（v0.6 起两种写法都支持：带 `--` 或省略 `--`）
npm run cli list                            # 列出所有 content（无需 --）
npm run cli status <id>                     # 查看单条 content JSON
npm run cli step <id>                       # 单步推进
npm run cli doctor                           # channel + crawler + engagement 健康检查
npm run cli persona list                     # 列出所有 persona
npm run cli persona show <id>                # 查看 persona 详情
npm run cli persona add <id> <name> [tone]   # 新增 persona
npm run cli persona remove <id>              # 删除 persona
npm run cli run <topic>                      # 创建并跑完一条 content（含翻译 en/ja/zh）
npm run cli run-ab <N> <topic>               # 跑 A/B 实验，N 个变体（>=2）
npm run cli run-with-persona <id> <topic>    # 用指定 persona 创建并跑
npm run cli feedback                         # 拉取所有 done content 的 engagement
npm run cli ab report <id> [--min-samples N] # 表格化输出 A/B 胜出方
npm run queue:work                          # 同 queue work（可配 cron）
npm run web [--port N] [--host addr] [--no-open]   # 启动 web（默认 127.0.0.1:5173；自动开浏览器除非 --no-open）
npm run web 7777                              # 等价于 --port 7777（v0.6 新写法）
npm run cli queue list                      # 列出发布队列
npm run cli queue work [--limit N]           # 跑一次 publish worker（重试 due 项）
npm run cli queue prune                      # 清理 failed_dead

# 不允许的端口（Chromium/Edge blocked）：
npm run web 6666                              # [error] unsafe browser port: 6666. Chromium/Edge blocks this port; use 6677 or 7777 instead.
npm run web --port 5060                       # 同上

# 真实 LLM（可选；默认 MockLlm 零依赖）
cp .env.example .env
# 编辑 IMA_LLM_ENDPOINT / IMA_LLM_KEY / IMA_LLM_MODEL 后：
set -a; source .env; set +a
npm run cli doctor                           # 输出 llm provider/model

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

## 测试覆盖（v0.6）

- **226/226 tests pass（100%）**
- core: 144 tests（翻译/ab-test/ranker/publish-queue 等）
- crawler: 9 tests
- publisher: 30 tests（含 6 真实 channel × fetch/healthCheck 测试）
- cli: 43 tests（v0.6 新增 parseWebOptions 边界 × 4、openBrowser 跨平台 × 2、readNpmPassthroughArgs × 1、cli-bin 集成 × 6）
- 覆盖率门禁：`npm run coverage` 自动 `c8 --statements 95 --branches 75 --functions 85 --lines 95`，当前 95.33% / 81.12% / 95.88% / 95.33%

## 最新验收（2026-06-21 v0.6）

| 命令 | 结果 |
|---|---|
| `npm test` | 226/226 pass（core 144 / crawler 9 / publisher 30 / cli 43） |
| `npm run coverage` | 95.33% lines/statements、81.12% branches、95.88% functions（c8 阈值通过） |
| `npm run check` | 5 packages `tsc --noEmit` pass |
| `npm run build` | 5 packages build pass |
| `npm run cli list` | 列出 6 条 content，无 `--` 可用 |
| `npm run cli status c1` | 输出 content JSON，无 `--` 可用 |
| `npm run web 7777` | `GET /` 200 + `[ok] web console at http://127.0.0.1:7777`，无 `--` 可用 |
| `npm run web --port 6677 --no-open` | 同上但跳过自动开浏览器 |
| `npm run web 6666` | 失败 `[error] unsafe browser port: 6666. Chromium/Edge blocks this port; use 6677 or 7777 instead.` |
| `npm run web --port 5060` | 同上（验证 npm_config_port 路径也走黑名单） |
| `npm run web 10080` | 失败（也是 unsafe port 列表成员） |
| `npm run cli queue list` | 列 6 个 queue item，全部 `posted` |
| `npm run queue:work` | 跑 0（无 due），no-op |
| `node --import tsx packages/cli/src/cli-bin.ts web 6678 --no-open` | 子进程 wrapper 启动 + 打印 banner（用于 cli-bin 集成测试） |
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