# influencer-multi-agent

多智能体跨平台大 V 全自动运营交付系统：基于网上热点自动生成内容，并一键分发到多平台。

## 架构

```
                    ┌────────────────────────────────────────────────┐
                    │                  @ima/cli                       │
                    │   CLI + bootstrap demo + 端到端编排入口           │
                    └─────────────────────┬──────────────────────────┘
                                          │
        ┌─────────────────────┬───────────┼─────────────┬──────────────────────┐
        │                     │           │             │                      │
┌───────▼────────┐   ┌─────────▼─────┐   ┌─▼──────────┐ ┌─▼────────────┐  ┌────▼───────────┐
│  @ima/core     │   │ @ima/crawler  │   │@ima/browser│ │@ima/publisher│  │ MCP / REST     │
│                │   │               │   │    -mcp    │ │              │  │ 上层 LLM 客户端 │
│ state machine  │   │ HTTP + JS 渲染│   │  Playwright│ │  X/小红书/   │  │                │
│ JSON storage   │◄──┤  + cache      │◄──┤  MCP server│ │  微博/B站/   │  │                │
│ LLM client     │   │  + robots.txt │   │  浏览器自动化│ │  Reddit 等   │  │                │
│ agent protocol │   │               │   │            │ │              │  │                │
└────────────────┘   └───────────────┘   └────────────┘ └──────────────┘  └────────────────┘
```

## 状态机（content workflow）

```
intake ─► research ─► ideas ─► draft ─► review ─► publish ─► done
                              ▲                          │
                              └──── needs_revision ◄─────┘
```

每条记录都是 `.ima/content/<id>.json`，覆盖 `intake` → `done` 全流程。

## 7 类 agent

| Agent | 责任 | 输入 | 输出 |
|-------|------|------|------|
| Research | 抓热点（crawler + browser-mcp）| 主题/关键词 | sources, signals |
| Idea | 从热点生成 3-10 个选题 | sources | idea 列表 |
| Draft | 生成内容（标题/正文/标签/封面建议）| idea | draft |
| Review | 审核（合规/去重/品牌一致性）| draft | review 报告 |
| Schedule | 计算发布时机 | review_pass + platform | schedule 计划 |
| Publish | 跨平台发布 | schedule + draft | post records |
| Audit | 监控效果 + 回写 learning | post records | insight 报告 |

## 启动

```bash
npm install
npm run build
npm run bootstrap        # 创建 3 个示例 content 走完整 pipeline
npm run cli -- run "AI Agent 趋势"
npm test
```

## 跨平台发布

`@ima/publisher` 内置 5 个平台 channel（实现是 stub，可接真实 API）：

- `x` — X / Twitter
- `xiaohongshu` — 小红书
- `weibo` — 微博
- `bilibili` — B 站动态
- `reddit` — Reddit

每个 channel 实现相同接口：`search`, `read`, `post`，参考 [Panniantong/Agent-Reach](https://github.com/Panniantong/Agent-Reach) 的 channels 设计。

## 设计参考

| 参考 | 借鉴 |
|------|------|
| [YeLuo45/pi-mono](https://github.com/YeLuo45/pi-mono) (influencer-multi-agent 占位分支) | npm workspaces + 4-5 packages 切分 |
| [Panniantong/Agent-Reach](https://github.com/Panniantong/Agent-Reach) | 多 channel 抽象 + cookie/config + doctor 自检 |
| [YeLuo45/chrome-devtools-mcp](https://github.com/YeLuo45/chrome-devtools-mcp) | MCP server 结构 + 浏览器自动化 |
| [YeLuo45/crawl4ai](https://github.com/YeLuo45/crawl4ai) | 抓取 → LLM-friendly markdown + 反爬 |

## License

MIT