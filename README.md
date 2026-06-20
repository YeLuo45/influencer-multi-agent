# influencer-multi-agent

多智能体跨平台大 V 全自动运营交付系统：根据网上热点生成内容并跨平台发布。

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
# 安装
npm install --ignore-scripts --no-audit --no-fund

# 构建
npm run build

# 类型检查（5 包 tsc --noEmit）
npm run check

# 单测（node:test, 79/79 pass）
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

## 测试覆盖（v0.2）

- **79/79 tests pass（100%）**
- core: 48 tests（state-machine × 7, storage × 4, llm × 4, pipeline × 5, engagement × 5, idea-ranker × 7, engagement-tracker × 7, persona × 9）
- crawler: 9 tests
- publisher: 9 tests
- browser-mcp: 13 tests（http MCP server 全场景）

## 参考

| 参考仓库 | 借鉴模式 |
|---|---|
| [YeLuo45/pi-mono](https://github.com/YeLuo45/pi-mono) | npm workspaces 5 包 + 严格 TS |
| [Panniantong/Agent-Reach](https://github.com/Panniantong/Agent-Reach) | 多 channel 抽象 + doctor 自检 |
| [YeLuo45/chrome-devtools-mcp](https://github.com/YeLuo45/chrome-devtools-mcp) | MCP server 6 tools + stdio |
| [YeLuo45/crawl4ai](https://github.com/YeLuo45/crawl4ai) | LLM-friendly markdown 抓取 |

## License

MIT