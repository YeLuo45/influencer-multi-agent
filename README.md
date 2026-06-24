# influencer-multi-agent

多智能体跨平台大 V 全自动运营交付系统：根据网上热点生成内容并跨平台发布。

## v6 新增（Release Ops Full Automation Batch）

| 方向 | 实现 |
|---|---|
| **Release Ops Dashboard v2** | `buildReleaseOpsDashboard()` 汇总 evidence、failed queue、history、CI、push recovery |
| **Safe Forward Executor** | `buildSafeForwardExecutionPlan()` 输出 dry-run/execute 逐步状态推进计划和 audit trail |
| **History Ledger Compaction** | `compactDeliveryHistoryLedger()` 保留最新记录并归档旧失败趋势 |
| **CI Evidence Auto-Ingest** | CI gates 进入 release ops dashboard 的 pass/fail 汇总 |
| **Structured Runbook** | `buildStructuredRunbook()` 输出 precondition、command、MCP forward 步骤 |
| **Web Action UI** | 生产运营页新增可见 action buttons，支持复制 runbook/MCP commands/download markdown |
| **Release Local Hardening** | `buildReleaseLocalHardeningPlan()` 提供隔离 storage root 和非递归 README verifier 命令链 |

## v4.7 新增（Push Recovery + Executable Delivery Actions）

| 方向 | 实现 |
|---|---|
| **Push recovery watchdog** | `buildPushRecoveryPlan()` 比较 local/remote commit，生成 `git push origin master` 恢复命令 |
| **Safe-forward execute confirmation** | `buildSafeForwardCommandPlan()` 只有精确 `EXECUTE P-...` 才进入 execute mode，默认 dry-run |
| **Delivery history JSONL** | `buildDeliveryHistoryJsonl()` / `parseDeliveryHistoryJsonl()` 支持 `.ima/delivery-history.jsonl` 持久账本 |
| **Web action manifest** | `buildWebActionManifest()` 暴露 copy runbook / copy MCP commands / download markdown 三个动作 |
| **CI run import** | `parseCiRunSummary()` 将 GitHub Actions job conclusion 转成 delivery gates，并可通过 `ingestCiEvidence()` 合并 |

## v4.2 新增（Delivery Automation Full Loop）

| 方向 | 实现 |
|---|---|
| **Delivery history ledger model** | `buildDeliveryHistorySnapshot()` 汇总最近 evidence、last deliverable commit 和 failed gate Top |
| **Executable safe-forward CLI** | `ima delivery safe-forward --proposal P-...` 默认 dry-run，输出确认 token 与 MCP 状态推进命令 |
| **Production runbook generator** | `ima delivery runbook --proposal P-...` 从 evidence/checklist/diff ownership/safe-forward 生成 copy-ready runbook |
| **Web action center payload** | `/api/production` 暴露 `history`、`safeForwardCommand`、`runbook`、`recommendations`，生产运营 tab 直接显示 |
| **CI evidence ingestion** | `ingestCiEvidence()` 将本地门禁与 GitHub Actions/CI gate 合并，不丢远端失败项 |
| **Iteration recommender** | `recommendNextIterations()` 根据 failed gates、diff ownership、coverage weak spots 生成下一轮方向 |

## v3.6 新增（Delivery Evidence & Safe Forward Gate）

| 方向 | 实现 |
|---|---|
| **验收证据模型** | `core/src/delivery-evidence.ts` 聚合 check/test/coverage/verify:readme/build 五门禁、local web 验证、失败门禁和 copy-ready Markdown |
| **安全状态推进计划** | `buildSafeForwardPlan()` 只在证据全绿时输出 `in_test_acceptance → accepted → deployed → delivered`；失败时只允许 `test_failed` |
| **失败提示清单** | `buildFailureChecklist()` 为 failed gate 给出 deterministic remediation hints，避免无人值守误推进 |
| **Diff ownership 分类** | `buildDiffOwnership()` 区分 proposal docs / product code / tests / generated artifacts / docs，交付报告可解释改动归属 |
| **Web 生产运营扩展** | `/api/production` 新增 `evidence`、`safeForward`、`failureChecklist`、`deliveryMarkdown`，首页「生产运营」tab 直接可见 |

## v2.9 新增（Production Operations Console）

| 方向 | 实现 |
|---|---|
| **生产运营 API** | `GET /api/production` 读取 `.ima/token-ledger.jsonl` 与 `.ima/audit.jsonl`，返回 replyQueue、tokenLedger、audit、channel、release action 和 budget snapshot |
| **Web 生产运营中心** | Web 首页新增「生产运营」tab，主界面直接展示 `/api/production` 的上线前运营验收快照，不再只藏在路线图 JSON 中 |
| **README 门禁同步** | `npm run verify:readme` 新增 `packages/cli/test/web-server-production.test.ts`，确保生产运营 API 是真实可执行验收项 |
| **提案文档 v2** | `docs/prd.v2.md` 与 `docs/technical-solution.v2.md` 记录无人值守本轮 Production Operations Console 范围与验收标准 |

## v2.8 新增（无人值守生产闭环：真实发送前安全门禁）

| 方向 | 实现 |
|---|---|
| **真实回复发送器计划** | `executeReplyQueue()` + `ima reply send --sandbox` 固化 sandbox-reply → audit.jsonl，真实发送必须显式 `--real` |
| **成本预算熔断** | `planLlmProviderWithBudget()` 按 day/month budget 自动降级 provider 到 mock/低价后备，并输出审计事件 |
| **A/B 自动决策器** | `applyAbWinnerDecision()` 把 significance 结果转换成 collect-more 或 apply-winner，并更新 variant 权重 |
| **Channel adapter v1 安全链** | `ChannelAdapterV1` + `runChannelAdapterSafetyChain()` 强制 auth-probe → sandbox-post → verify → cleanup |
| **运营审计持久化计划** | `appendAuditJsonl()` 输出 `.ima/audit.jsonl` 兼容 JSONL 追加行；`/api/roadmap` 暴露 production snapshot |
| **E2E release:local** | `npm run release:local` 聚合 bootstrap、queue:work、feedback、verify:readme、`ima release-local-json`，避免递归 verify |
| **SSE 真持续推送计划** | `buildSseTickPlan()` 输出 bounded interval、snapshot event 和稳定 change hash；Web 路线图优先展示 production 控制台 |

## v2.1 新增（无人值守路线图收口：互动闭环 + 成本 + 显著性 + 安全发布 + E2E）

| 方向 | 实现 |
|---|---|
| **评论自动回复闭环** | `core/src/roadmap.ts` 的 `buildReplyQueue()` 从 `EngagementMetric.commentTexts[]` 生成优先级回复草稿，支持 source/link 类评论加权 |
| **Token/成本预算账本** | `recordTokenUsage()` + `summarizeTokenLedger()` 汇总 provider/model/day 维度调用数、tokens、USD 成本 |
| **A/B 显著性检验** | `evaluateAbSignificance()` 在样本量不足时拒绝判胜，输出 confidence/uplift/reason |
| **真实 channel 安全接入计划** | `buildChannelSandboxPlan(['x','reddit'])` 固化 dry-run → channel-test → publish-test → verify → cleanup 安全链，默认不允许真实发布 |
| **E2E Harness 计划** | `buildE2EHarnessPlan()` 固化 bootstrap → queue-work → feedback → ab-report → verify-readme 门禁 |
| **SSE 持续推送策略** | `planRealtimeSse()` 限制 interval 下限 250ms，支持 replay last snapshot |
| **Web 审计面板** | `/api/roadmap` + Web「路线图」tab 展示回复/成本/A-B/channel/E2E/realtime/audit 摘要 |

## v1.4 新增（V14：Web 实时推送）

| 方向 | 实现 |
|---|---|
| **Web 实时 EventSource** | `GET /api/events` 输出 `text/event-stream` 首帧 `snapshot`，包含 contents 数、queue summary、metrics 计数；Web Header 新增「实时」状态 badge，浏览器用 `EventSource('/api/events')` 收到 snapshot 后自动刷新 contents/queue/stats/metrics 面板，零新增依赖 |

## v1.2 新增（V12：生产发布控制台 + 本地安全治理）

| 方向 | 实现 |
|---|---|
| **1. 本地 secret vault** | `core/src/local-secret-vault.ts` + CLI `ima secret set/get/list`，token 不明文落盘，错误 passphrase 返回 null，不抛异常 |
| **2. 平台 rate policy** | `core/src/rate-limit-policy.ts` 提供默认 6 平台发布限流策略、limiter 工厂和 operator-readable summary |
| **3. sandbox 发布执行/清理** | `executeSandboxPublish()` 给标题和 tags 加 sandbox 标记；`cleanupSandboxPost()` 支持可选 deletePost，unsupported 时安全返回错误 |
| **4. Web bulk + metrics dashboard** | Web 首页新增 stats / metrics tab、bulk pause/resume/retry/cancel 按钮；API 新增 `/api/bulk/*` 和 JSON `/api/metrics`，Prometheus 文本保留 `/metrics` |
| **5. README 命令验收脚本** | 新增 `npm run verify:readme`，把 README 的核心命令与文档化 test entrypoint 纳入可执行验收 |

## v1.1 新增（A+B+C+D+E+F+G 七个方向：真实发布闭环 + 生产治理）

| 方向 | 实现 |
|---|---|
| **A. PublishAgent 平台限流接入** | `AgentContext.rateLimiter` 接入 `PublishAgent`，key=`publish:<platform>`；超限平台不会调用真实 `publisher.post()`，而是写入 `failed_retry` 队列并返回 failed record，避免触发平台风控 |
| **B. sandbox 发布闭环预检** | `core/src/sandbox-publish.ts` 新增 `buildSandboxPublishPlan()` + `verifySandboxPost()`，强制 `--sandbox`、输出 dry-run/channel-test/publish-test/verify/cleanup 检查链，默认不真实发帖 |
| **C. Web 控制台 stats/queue 操作模型** | `core/src/web-console.ts` 提供 `buildWebConsoleSnapshot()`，`/api/stats` 现在附带 `console.tabs/actions/badges`，前端可直接展示 stats tab + queue 操作按钮 |
| **D. Paused/Bulk 内容治理** | `reduceBulkContentAction()` 支持 pause/resume/retry/cancel 批量内容治理，按 stage 或 ids 过滤，所有变更写 audit history |
| **E. Secrets 真实 provider + 诊断** | `loadSecret()` 支持注入式 `vault:` / `keychain:` provider；`diagnoseSecrets()` 输出 ok/missing/fix/redacted，保证不泄露 token 原文 |
| **F. Metrics 持久化 + Prometheus exporter** | `core/src/persistent-metrics.ts` 写 `.ima/metrics.jsonl`，支持 counter/histogram snapshot；web 新增 `/metrics` Prometheus 文本端点 |
| **G. npm 发布流水线 gate** | `buildPrepublishGate()` 生成 `npm test/check/build/coverage + npm pack -w @ima/cli --dry-run` 五段 gate；`validateBuild()` 可拒绝缺 coverage 的发布配置 |

## v1.0 新增（1+2+3+4+5+6+7 七个方向：生产化）

| 方向 | 实现 |
|---|---|
| **1. Observability — 结构化日志 + 指标** | `core/src/observability.ts` 提供 `createLogger({sink, level})` + child logger（继承父 context），`InMemoryMetrics` 提供 counter + histogram（p50 百分位），全部 zero-dep、tree-shakeable |
| **2. 真实平台连通验证** | `core/src/channel-test.ts` 的 `channelHealthCheck(platform, opts)` ping 各平台 `/me` 端点（X / Reddit / B站 / 微博 / 小红书 / YouTube），不上帖；`summarizeChannelHealth()` 统计 ok / fail / retryable。CLI `ima channel-test <platform>` 一行命令 |
| **3. Secret 管理抽象** | `core/src/secrets.ts` 提供 `loadSecret(key, opts)`，支持 `NAME`（env）/ `file:/path`（trim 读文件）/ `vault:KEY` / `keychain:NAME`（v1.1 接入），缺失/未读/未知 scheme 一律返回 `null`（永不抛） |
| **4. 状态机扩展 + bulk 操作** | state-machine 增加 `paused` super-stage：每个 stage 可→paused，paused 可回到任意 lifecycle stage（仅 done 例外）。`isTerminal()` 仍把 `done` 视为 lifecycle 终态（忽略 paused 边），pipeline 循环行为不变；`stageRank()` 比较 lifecycle 顺序；`setStage()` helper 统一写 history |
| **5. Web stats 面板** | `core/src/web-stats.ts` 纯函数 `computeWebStats(input)` 聚合 contents / queue / feedback / AB / LLM 元数据；web 端点 `/api/stats` 一次返回全量聚合，前端可直接画图 |
| **6. Queue 限流** | `core/src/rate-limit.ts` 提供 `TokenBucketLimiter`，per-key 隔离、burst up to capacity、token refill、stats 暴露；为 v1.1 的 publish rate-limit per platform 铺路 |
| **7. CLI 发布工具** | `packages/cli/src/publish.ts` 提供 `buildPublish` + `suggestVersion`（patch/minor/major/rc） + `validateBuild`（含 prerelease 验证）；CLI `ima publish-cli [--major|--minor|--rc|--pack]` 输出 tarball 路径；`@ima/cli` 全局包发布路径铺好 |

## v0.9 新增（1+2+3+4+5+6+7 七个方向）

| 方向 | 实现 |
|---|---|
| **1. 真实 LLM 全链路 `selectLlm()` 工厂 + 探针** | 新增 `selectLlm(env, opts)` 工厂 + `LlmSelection.probe()` 探针；`/api/llm/probe` POST 端点做连通性测试；`createApp` 走 `selectLlm()`，web UI 头部加 LLM 状态卡 + 「探测」按钮 |
| **2. Web UI 真实按钮** | `apps/web/app.js` 加 `loadLlmBadge/probeLlm`、`runSubmit`（POST /api/run）、`queueWork`（POST /api/queue/work）、`refreshAll`；`index.html` 新增「新建」tab + 「Run pipeline」表单 + 「Run queue worker once」按钮 |
| **3. Bootstrap 真实 engagement 模式** | `runBootstrapDemo` 新增 `engagementSource: 'real-fetch'`，向 LLM 询问 `{"count": N}` 派生指标；测试覆盖本地 deterministic + LLM 派生两条路径 |
| **4. Queue daemon 持久化模板** | `docs/queue-daemon.service`（systemd unit）和 `docs/queue-daemon.pm2.cjs`（PM2 ecosystem）；均引用 `npm run queue:daemon`，含 restart / autorestart / log 路径 |
| **5. Dry-run JSON 输出** | `ima dry-run <id> --json` 输出结构化 JSON（dryRun, contentId, targets, preview），`--markdown`/`--out path` 同理；适合接入 CI |
| **6. Coverage 收紧到 96%** | 新增 `protocol-helpers.test.ts` × 5、`idea-coverage.test.ts` × 5、`pipeline-coverage.test.ts` × 7 = 17 个测试；`All files 95.13% → 96.52%`。**顺便修了 v0.7 之前的真 bug**：`needs_revision → done` 在 state-machine 中不是合法 transition，原 cap 路径永远失败 |
| **7. CI 多 Node 版本 matrix** | `.github/workflows/ci.yml` 加 `matrix.node-version: ['20.20.2', '22.11.0']`；artifact 命名带 Node 版本；`fail-fast: false` 让一个 Node 失败不阻塞另一个 |

## v0.8 新增（1+2+3+4+5+6+7 七个方向）

| 方向 | 实现 |
|---|---|
| **1. Web 控制台 LLM 切换 + 失败 UI** | 新增 `GET /api/llm` 暴露 provider/model/mock 警告；`web-server` 接受 `llm` 选项注入；后续 LLM 真实接入只需在 `createApp()` 切换 LLM 实例即可在 UI 中即时反映 |
| **2. Bootstrap demo 抽象 + 真实 LLM 钩子** | `runBootstrapDemo({ app, llm, writeBackToFeedback, demos, now })` 抽成可复用函数；`defaultBootstrapOptions()` 返回安全默认；新增 `npm run cli -- bootstrap-real [--write-back-to-feedback]` 命令 |
| **3. Web 控制台「run topic」+「queue work」按钮** | `POST /api/run { topic, persona }` 创建 content 入口；`POST /api/queue/work` 扫描队列；web UI 可通过这两个端点形成运营工作台 |
| **4. Queue worker 守护进程** | 新增 `packages/cli/src/queue-worker-loop.ts` 的 `createQueueWorkerLoop()`；`npm run queue:daemon [--interval N]` 长驻循环，进程退出由 SIGINT/SIGTERM 触发优雅 stop |
| **5. 平台 dry-run 预览** | `core/src/dry-run.ts` 新增 `runDryRun({ store, id, registry? })`；不走任何 channel，仅跑 `adaptForPlatform` 给出预览；CLI `npm run cli -- dry-run <id>` 输出每个 platform 的 body 摘要与 tag |
| **6. `ima doctor` 增强 LLM/feedback 提醒** | mock LLM 现在用 `WARN` 前缀提示需要配置 `IMA_LLM_*`；feedback.json 缺失时 `WARN feedback none`；存在时输出 `lastUpdated/age/window/total` |
| **7. Bootstrap demo 改 tsx 单测 + 烟雾** | `packages/cli/test/bootstrap.test.ts` 提供 3 个单测覆盖 `runBootstrapDemo` 行为；`dry-run.test.ts` 覆盖 `runDryRun`；新增的 `npm run cli -- bootstrap-real` 在生产可作为冒烟测试脚本 |

## v0.7 新增（1+2+3+4 四个方向）

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

# 单测（node:test, 97/97 pass）
npm test

# 覆盖率门禁（c8，阈值 ≥95% lines/statements、≥85% functions、≥75% branches）
npm run coverage

# README 命令验收
npm run verify:readme

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
npm run cli ab report <id> --json --out reports/<id>.json      # 导出 JSON 报告
npm run cli ab report <id> --markdown --out reports/<id>.md    # 导出 Markdown 报告
npm run cli dry-run <id>                  # 预览每个 platform 的适配后内容（不调用 channel）
npm run cli dry-run <id> --json --out reports/dry.json  # 结构化 JSON 输出
npm run cli channel-test <platform>            # ping X/Reddit/B站/微博/小红书/YouTube（不上帖）
npm run cli publish-cli [--major|--minor|--rc] # 计算 next semver + tarball 路径（@ima/cli 全局包发布铺路）
npm run cli reply send --sandbox          # 沙盒回复执行器；追加 .ima/audit.jsonl，不触达真实平台
npm run cli production                     # 输出生产控制台 JSON snapshot
npm run cli delivery safe-forward --proposal P-20260624-013  # 输出 safe-forward dry-run MCP 状态推进命令
npm run cli delivery runbook --proposal P-20260624-013       # 输出 copy-ready production runbook
npm run cli release-local-json             # 输出 release:local 机器可读 JSON 报告
node --test --import tsx packages/core/test/publish-rate-limit.test.ts   # 验证 PublishAgent per-platform 限流
node --test --import tsx packages/core/test/sandbox-publish.test.ts      # 验证 sandbox 发布闭环预检
node --test --import tsx packages/core/test/secret-diagnostics.test.ts   # 验证 vault/keychain 诊断不泄露 secret
node --test --import tsx packages/core/test/persistent-metrics.test.ts   # 验证 .ima/metrics.jsonl + Prometheus 序列化
node --test --import tsx packages/core/test/roadmap.test.ts              # 验证无人值守路线图 7 方向纯函数
node --test --import tsx packages/cli/test/web-server-metrics.test.ts    # 验证 /metrics 端点
node --test --import tsx packages/core/test/production-automation.test.ts # 验证 production reply/budget/AB/channel/release helpers
node --test --import tsx packages/core/test/delivery-evidence.test.ts     # 验证 delivery evidence / safe-forward / failure hints
node --test --import tsx packages/cli/test/web-server-events.test.ts     # 验证 /api/events SSE 首帧 snapshot
node --test --import tsx packages/cli/test/web-server-roadmap.test.ts    # 验证 /api/roadmap 路线图摘要
node --test --import tsx packages/cli/test/web-server-production.test.ts  # 验证 /api/production evidence payload
node --test --import tsx packages/cli/test/web-ui-events.test.ts         # 验证 Web Header 实时 badge + EventSource 自动刷新
node --test --import tsx packages/cli/test/web-ui-roadmap.test.ts        # 验证 Web 路线图 tab 可发现
npm run cli bootstrap-real [--write-back-to-feedback]  # 跑 bootstrap demo（v0.8 抽象版）
npm run queue:work                          # 同 queue work（可配 cron）
npm run queue:daemon [--interval N]         # 长驻循环，SIGINT/SIGTERM 优雅 stop（systemd/pm2 模板见 docs/）
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

## 测试覆盖（v1.1）

- **340/340 tests pass（100%）**
- core: 217 tests（新增 `publish-rate-limit.test.ts` × 2、`sandbox-publish.test.ts` × 3、`web-console.test.ts` × 2、`secret-diagnostics.test.ts` × 3、`persistent-metrics.test.ts` × 2 = 12 个新测试）
- crawler: 9 tests
- browser-mcp: 14 tests
- publisher: 30 tests
- cli: 70 tests（新增 `publish-gate.test.ts` × 2、`web-server-metrics.test.ts` × 1 = 3 个新测试）
- 覆盖率门禁：`npm run coverage` 自动 `c8 --statements 95 --branches 75 --functions 85 --lines 95`，当前 **96.47% statements/lines、81.63% branches、95.65% functions**

## 最新验收（2026-06-23 v1.1）

| 命令 | 结果 |
|---|---|
| `npm test` | 340/340 pass（core 217 / crawler 9 / browser-mcp 14 / publisher 30 / cli 70） |
| `npm run check` | 5 packages `tsc --noEmit` pass |
| `npm run build` | 5 packages build pass |
| `npm run coverage` | **96.47% statements/lines、81.63% branches、95.65% functions**（c8 阈值 95/75/85/95 通过） |
| `node --test --import tsx packages/core/test/publish-rate-limit.test.ts` | 2/2 pass；rate-limited `publish:x` 不调用真实 post，写入 `failed_retry` 队列 |
| `node --test --import tsx packages/core/test/sandbox-publish.test.ts` | 3/3 pass；sandbox plan 强制 `--sandbox` 并生成 verify/cleanup 链 |
| `node --test --import tsx packages/core/test/secret-diagnostics.test.ts` | 3/3 pass；`vault:` / `keychain:` provider 可注入，诊断输出 redacted secret |
| `node --test --import tsx packages/core/test/persistent-metrics.test.ts` | 2/2 pass；`.ima/metrics.jsonl` 持久化 + Prometheus 序列化 |
| `node --test --import tsx packages/cli/test/web-server-metrics.test.ts` | 1/1 pass；`GET /metrics` 返回 Prometheus text/plain |
| `node --import tsx packages/cli/src/cli-bin.ts channel-test x` | `FAIL x missing credential: set IMA_X_TOKEN [auth] 0ms` + `[channel-test] 0/1 ok; retryable=0`（无 token 走缺失凭据路径） |
| `node --import tsx packages/cli/src/cli-bin.ts publish-cli --minor` | `[publish] @ima/cli@0.2.0 tarball=ima-cli-0.2.0.tgz dryRun=true`（从 package.json 读当前 version 算 semver bump） |

## 参考

| 参考仓库 | 借鉴模式 |
|---|---|
| [YeLuo45/pi-mono](https://github.com/YeLuo45/pi-mono) | npm workspaces 5 包 + 严格 TS |
| [Panniantong/Agent-Reach](https://github.com/Panniantong/Agent-Reach) | 多 channel 抽象 + doctor 自检 |
| [YeLuo45/chrome-devtools-mcp](https://github.com/YeLuo45/chrome-devtools-mcp) | MCP server 6 tools + stdio |
| [YeLuo45/crawl4ai](https://github.com/YeLuo45/crawl4ai) | LLM-friendly markdown 抓取 |

## License

MIT